import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { createGzip, gzipSync } from 'node:zlib';

import { MAX_COMPRESS_SIZE, SUPPORTED_METHODS } from './constants.js';
import { getContentType, typeForFilePath } from './content-type.js';
import { getLocalPath, isSubpath } from './fs-utils.js';
import { dirListPage, errorPage } from './pages.js';
import { PathMatcher } from './path-matcher.js';
import { headerCase, trimSlash } from './utils.js';

/**
@typedef {import('node:http').IncomingMessage & {originalUrl?: string}} Request
@typedef {import('node:http').ServerResponse<Request>} Response
@typedef {import('./types.d.ts').FSLocation} FSLocation
@typedef {import('./types.d.ts').ResMetaData} ResMetaData
@typedef {import('./types.d.ts').ServerOptions} ServerOptions
@typedef {{
	body?: string | Buffer | import('node:fs').ReadStream;
	contentType?: string;
	isText?: boolean;
	statSize?: number;
}} SendPayload
*/

export class RequestHandler {
	#req;
	#res;
	#resolver;
	#options;

	/** @type {ResMetaData['timing']} */
	timing = { start: Date.now() };
	/** @type {string | null} */
	urlPath = null;
	/** @type {FSLocation | null} */
	file = null;
	/** @type {Error | string | undefined} */
	error;

	/**
	@param {{
		req: Request;
		res: Response;
		resolver: import('./resolver.js').FileResolver;
		options: ServerOptions & {_noStream?: boolean};
	}} config
	*/
	constructor({ req, res, resolver, options }) {
		this.#req = req;
		this.#res = res;
		this.#resolver = resolver;
		this.#options = options;

		try {
			this.urlPath = extractUrlPath(req.url ?? '');
		} catch (/** @type {any} */ err) {
			this.error = err;
		}

		res.on('close', () => {
			this.timing.close = Date.now();
		});
	}

	get method() {
		return this.#req.method ?? '';
	}
	get status() {
		return this.#res.statusCode;
	}
	set status(code) {
		if (this.#res.headersSent) return;
		this.#res.statusCode = code;
	}
	get headers() {
		return this.#res.getHeaders();
	}
	get localPath() {
		if (this.file) {
			return getLocalPath(this.#options.root, this.file.filePath);
		}
		return null;
	}

	async process() {
		// bail for unsupported http methods
		if (!SUPPORTED_METHODS.includes(this.method)) {
			this.status = 405;
			this.error = new Error(`HTTP method ${this.method} is not supported`);
			return this.#sendErrorPage();
		}

		// no need to look up files for the '*' OPTIONS request
		if (this.method === 'OPTIONS' && this.urlPath === '*') {
			this.status = 204;
			this.#setHeaders('*', { cors: this.#options.cors });
			return this.#send();
		}

		if (this.urlPath == null) {
			this.status = 400;
			return this.#sendErrorPage();
		}

		const localPath = trimSlash(decodeURIComponent(this.urlPath));
		const { status, file } = await this.#resolver.find(localPath);
		this.status = status;
		this.file = file;

		// found a file to serve
		if (status === 200 && file?.kind === 'file') {
			return this.#sendFile(file.filePath);
		}

		// found a directory that we can show a listing for
		if (status === 200 && file?.kind === 'dir' && this.#options.dirList) {
			return this.#sendListPage(file.filePath);
		}

		return this.#sendErrorPage();
	}

	/** @type {(filePath: string) => Promise<void>} */
	async #sendFile(filePath) {
		/** @type {import('node:fs/promises').FileHandle | undefined} */
		let handle;
		/** @type {SendPayload} */
		let data = {};

		try {
			// already checked in resolver, but better safe than sorry
			if (!isSubpath(this.#options.root, filePath)) {
				throw new Error(`File '${filePath}' is not contained in root: '${this.#options.root}'`);
			}
			// check that we can open the file (especially on windows where it might be busy)
			handle = await open(filePath);
			const type = await getContentType({ path: filePath, handle });
			data = {
				contentType: type.toString(),
				isText: type.group === 'text',
				statSize: (await stat(filePath)).size,
			};
		} catch (/** @type {any} */ err) {
			this.status = err?.code === 'EBUSY' ? 403 : 500;
			if (err && (err.message || typeof err === 'object')) this.error = err;
		} finally {
			await handle?.close();
		}

		if (this.status >= 400) {
			return this.#sendErrorPage();
		}

		this.#setHeaders(filePath, {
			contentType: data.contentType,
			cors: this.#options.cors,
			headers: this.#options.headers,
		});

		if (this.method === 'OPTIONS') {
			this.status = 204;
		}
		// read file as stream
		else if (this.method !== 'HEAD' && !this.#options._noStream) {
			data.body = createReadStream(filePath, { autoClose: true, start: 0 });
		}

		return this.#send(data);
	}

	/** @type {(filePath: string) => Promise<void>} */
	async #sendListPage(filePath) {
		this.#setHeaders('index.html', {
			cors: false,
			headers: [],
		});
		if (this.method === 'OPTIONS') {
			this.status = 204;
			return this.#send();
		}
		const items = await this.#resolver.index(filePath);
		const body = await dirListPage({
			root: this.#options.root,
			ext: this.#options.ext,
			urlPath: this.urlPath ?? '',
			filePath,
			items,
		});
		return this.#send({ body, isText: true });
	}

	/** @type {() => Promise<void>} */
	async #sendErrorPage() {
		this.#setHeaders('error.html', {
			cors: this.#options.cors,
			headers: [],
		});
		if (this.method === 'OPTIONS') {
			return this.#send();
		}
		const body = await errorPage({
			status: this.status,
			url: this.#req.url ?? '',
			urlPath: this.urlPath,
		});
		return this.#send({ body, isText: true });
	}

	/** @type {(payload?: SendPayload) => void} */
	#send({ body, isText = false, statSize } = {}) {
		this.timing.send = Date.now();

		// stop early if possible
		if (this.#req.destroyed) {
			this.#res.end();
			return;
		} else if (this.method === 'OPTIONS') {
			this.#header('content-length', '0');
			this.#res.end();
			return;
		}

		const isHead = this.method === 'HEAD';
		const compress =
			this.#options.gzip &&
			canCompress({ accept: this.#req.headers['accept-encoding'], isText, statSize });

		// Send file contents if already available
		if (typeof body === 'string' || Buffer.isBuffer(body)) {
			const buf = compress ? gzipSync(body) : Buffer.from(body);
			this.#header('content-length', buf.byteLength);
			if (compress) {
				this.#header('content-encoding', 'gzip');
			}
			if (!isHead) {
				this.#res.write(buf);
			}
			this.#res.end();
			return;
		}

		// No content-length when compressing: we can't use the stat size,
		// and compressing all at once would defeat streaming and/or run out of memory
		if (typeof statSize === 'number' && !compress) {
			this.#header('content-length', String(statSize));
		}

		if (isHead || body == null) {
			this.#res.end();
			return;
		}

		// Send file stream
		if (compress) {
			this.#header('content-encoding', 'gzip');
			body.pipe(createGzip()).pipe(this.#res);
		} else {
			body.pipe(this.#res);
		}
	}

	/**
	@type {(name: string, value: null | number | string | string[], normalizeCase?: boolean) => void}
	*/
	#header(name, value, normalizeCase = true) {
		if (this.#res.headersSent) return;
		if (normalizeCase) name = headerCase(name);
		if (typeof value === 'number') value = String(value);
		if (value === null) {
			this.#res.removeHeader(name);
		} else {
			this.#res.setHeader(name, value);
		}
	}

	/**
	Set all response headers, except for content-length
	@type {(filePath: string, options: Partial<{ contentType: string, cors: boolean; headers: ServerOptions['headers'] }>) => void}
	*/
	#setHeaders(filePath, { contentType, cors, headers }) {
		if (this.#res.headersSent) return;

		const isOptions = this.method === 'OPTIONS';
		const headerRules = headers ?? this.#options.headers;

		if (isOptions || this.status === 405) {
			this.#header('allow', SUPPORTED_METHODS.join(', '));
		}

		if (!isOptions) {
			contentType ??= typeForFilePath(filePath).toString();
			this.#header('content-type', contentType);
		}

		if (cors ?? this.#options.cors) {
			this.#setCorsHeaders();
		}

		const localPath = getLocalPath(this.#options.root, filePath);
		if (localPath != null && headerRules.length) {
			const blockList = ['content-encoding', 'content-length'];
			for (const { name, value } of fileHeaders(localPath, headerRules, blockList)) {
				this.#header(name, value, false);
			}
		}
	}

	#setCorsHeaders() {
		const origin = this.#req.headers['origin'];
		if (!origin) return;
		this.#header('access-control-allow-origin', origin);
		if (isPreflight(this.#req)) {
			this.#header('access-control-allow-methods', SUPPORTED_METHODS.join(', '));
			const allowHeaders = parseHeaderNames(this.#req.headers['access-control-request-headers']);
			if (allowHeaders.length) {
				this.#header('access-control-allow-headers', allowHeaders.join(', '));
			}
			this.#header('access-control-max-age', '60');
		}
	}

	/** @type {() => ResMetaData} */
	data() {
		return {
			status: this.status,
			method: this.method,
			url: this.#req.url ?? '',
			urlPath: this.urlPath,
			localPath: this.localPath,
			timing: structuredClone(this.timing),
			error: this.error,
		};
	}
}

/**
@type {(data: { accept?: string | string[]; isText?: boolean; statSize?: number }) => boolean}
*/
function canCompress({ accept = '', statSize = 0, isText = false }) {
	accept = Array.isArray(accept) ? accept.join(',') : accept;
	if (isText && statSize <= MAX_COMPRESS_SIZE && accept) {
		return accept
			.toLowerCase()
			.split(',')
			.some((value) => value.split(';')[0].trim() === 'gzip');
	}
	return false;
}

/**
@type {(localPath: string, rules: ServerOptions['headers'], blockList?: string[]) => Array<{name: string; value: string}>}
*/
export function fileHeaders(localPath, rules, blockList = []) {
	/** @type {ReturnType<fileHeaders>}  */
	const result = [];
	for (const rule of rules) {
		if (Array.isArray(rule.include)) {
			const matcher = new PathMatcher(rule.include);
			if (!matcher.test(localPath)) continue;
		}
		for (const [name, value] of Object.entries(rule.headers)) {
			if (blockList.includes(name.toLowerCase())) continue;
			result.push({ name, value: String(value) });
		}
	}
	return result;
}

/** @type {(req: Pick<import('node:http').IncomingMessage, 'method' | 'headers'>) => boolean} */
function isPreflight({ method, headers }) {
	return (
		method === 'OPTIONS' &&
		typeof headers['origin'] === 'string' &&
		typeof headers['access-control-request-method'] === 'string'
	);
}

/** @type {(input?: string) => string[]} */
function parseHeaderNames(input = '') {
	const isHeader = (h = '') => /^[A-Za-z\d-_]+$/.test(h);
	return input
		.split(',')
		.map((h) => h.trim())
		.filter(isHeader);
}

/** @type {(url: string) => string} */
export function extractUrlPath(url) {
	if (url === '*') return url;
	const path = new URL(url, 'http://localhost/').pathname || '/';
	if (!isValidUrlPath(path)) {
		throw new Error(`Invalid URL path: '${path}'`);
	}
	return path;
}

/** @type {(urlPath: string) => boolean} */
export function isValidUrlPath(urlPath) {
	if (urlPath === '/') return true;
	if (!urlPath.startsWith('/') || urlPath.includes('//')) return false;
	for (const s of trimSlash(urlPath).split('/')) {
		const d = decodeURIComponent(s);
		if (d === '.' || d === '..') return false;
		if (s.includes('?') || s.includes('#')) return false;
		if (d.includes('/') || d.includes('\\')) return false;
	}
	return true;
}
