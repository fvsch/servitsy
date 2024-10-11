import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createGzip, gzipSync } from 'node:zlib';

import { MAX_COMPRESS_SIZE, SUPPORTED_METHODS } from './constants.js';
import { getContentType, typeForFilePath } from './content-type.js';
import { dirListPage, errorPage } from './pages.js';
import { PathMatcher } from './path-matcher.js';
import { FileResolver } from './resolver.js';
import { headerCase } from './utils.js';

/**
@typedef {import('node:fs/promises').FileHandle} FileHandle
@typedef {import('node:http').IncomingMessage} IncomingMessage
@typedef {import('node:http').Server} Server
@typedef {import('node:http').ServerResponse} ServerResponse
@typedef {import('./content-type.js').TypeResult} TypeResult
@typedef {import('./types.js').ReqResMeta} ReqResMeta
@typedef {import('./types.js').ResolvedFile} ResolvedFile
@typedef {import('./types.js').ServerOptions} ServerOptions
@typedef {{
	body?: string | Buffer | import('node:fs').ReadStream;
	isText?: boolean;
	statSize?: number;
}} SendPayload
**/

/**
 * @param {ServerOptions} options
 * @param {{ logNetwork?: (data: ReqResMeta) => void }} [callbacks]
 * @returns {Server}
 */
export function staticServer(options, { logNetwork } = {}) {
	const resolver = new FileResolver(options);

	return createServer(async (req, res) => {
		const handler = new RequestHandler({ req, res }, resolver, options);
		if (typeof logNetwork === 'function') {
			res.on('close', () => logNetwork(handler.data()));
		}
		await handler.process();
	});
}

export class RequestHandler {
	#req;
	#res;
	#options;
	#resolver;

	/** @type {number} */
	startedAt;
	/** @type {number | undefined} */
	endedAt;
	/** @type {string} */
	url = '';
	/** @type {string} */
	urlPath = '';
	/**
	 * File matching the requested urlPath, if found and readable
	 * @type {ResolvedFile | null}
	 */
	file = null;
	/**
	 * Error that may be logged to the terminal
	 * @type {Error | string | undefined}
	 */
	error;

	/**
	 * @param {{ req: IncomingMessage, res: ServerResponse }} reqRes
	 * @param {FileResolver} resolver
	 * @param {ServerOptions & {_noStream?: boolean}} options
	 */
	constructor({ req, res }, resolver, options) {
		this.#req = req;
		this.#res = res;
		this.#resolver = resolver;
		this.#options = options;

		this.startedAt = Date.now();
		res.on('close', async () => {
			this.endedAt = Date.now();
		});

		if (req.url) {
			this.url = req.url;
			this.urlPath = req.url.split(/[\?\#]/)[0];
		}
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

	async process() {
		// bail for unsupported http methods
		if (!SUPPORTED_METHODS.includes(this.method)) {
			this.status = 405;
			this.error = new Error(`HTTP method ${this.method} is not supported`);
			return this.#sendErrorPage();
		}

		// no need to look up files for the '*' OPTIONS request
		if (this.method === 'OPTIONS' && this.url === '*') {
			this.status = 204;
			this.#setHeaders('*', { cors: this.#options.cors });
			return this.#send();
		}

		const { status, urlPath, file } = await this.#resolver.find(this.url);
		this.status = status;
		this.urlPath = urlPath;
		this.file = file;

		// found a file to serve
		if (status === 200 && file?.kind === 'file' && file.localPath != null) {
			return this.#sendFile(file);
		}

		// found a directory that we can show a listing for
		else if (status === 200 && file?.kind === 'dir' && file.localPath != null) {
			return this.#sendListPage(file);
		}

		return this.#sendErrorPage();
	}

	/**
	 * @param {ResolvedFile} file
	 */
	async #sendFile(file) {
		/** @type {FileHandle | undefined} */
		let handle;
		/** @type {number | undefined} */
		let statSize;
		/** @type {TypeResult | undefined} */
		let contentType;

		try {
			// check that we can actually open the file
			// (especially on windows where it might be busy)
			handle = await open(file.filePath);
			statSize = (await handle.stat()).size;
			contentType = await getContentType({ filePath: file.filePath, fileHandle: handle });
		} catch (/** @type {any} */ err) {
			if (err?.syscall === 'open' && err.code === 'EBUSY') {
				this.status = err?.syscall === 'open' && err.code === 'EBUSY' ? 403 : 500;
			}
			if (err?.message) {
				this.error = err;
			}
		} finally {
			await handle?.close();
		}

		if (this.status >= 400) {
			return this.#sendErrorPage();
		}

		this.#setHeaders(file.localPath ?? file.filePath, {
			contentType: contentType?.toString(),
			cors: this.#options.cors,
			headers: this.#options.headers,
		});

		/** @type {SendPayload} */
		const data = { isText: contentType?.group === 'text', statSize };

		if (this.method === 'OPTIONS') {
			this.status = 204;
		}
		// read file as stream
		else if (this.method !== 'HEAD' && !this.#options._noStream) {
			data.body = createReadStream(file.filePath, { autoClose: true, start: 0 });
		}

		return this.#send(data);
	}

	/**
	 * @param {ResolvedFile} dir
	 */
	async #sendListPage(dir) {
		this.#setHeaders('index.html', {
			cors: false,
			headers: [],
		});

		if (this.method === 'OPTIONS') {
			this.status = 204;
			return this.#send();
		}

		const items = await this.#resolver.index(dir.filePath);
		return this.#send({
			body: await dirListPage({ urlPath: this.urlPath, file: dir, items }, this.#options),
			isText: true,
		});
	}

	async #sendErrorPage() {
		this.#setHeaders('error.html', {
			cors: this.#options.cors,
			headers: [],
		});

		if (this.method === 'OPTIONS') {
			return this.#send();
		}

		return this.#send({
			body: await errorPage({ status: this.status, urlPath: this.urlPath }),
			isText: true,
		});
	}

	/**
	 * @param {SendPayload} [payload]
	 */
	#send({ body, isText = false, statSize } = {}) {
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
	 * @param {string} name
	 * @param {null | number | string | string[]} value
	 * @param {boolean} [normalizeCase]
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
	 * Set all response headers, except for content-length
	 * @param {string} localPath
	 * @param {Partial<{ contentType: string, cors: boolean; headers: ServerOptions['headers'] }>} options
	 */
	#setHeaders(localPath, { contentType, cors, headers }) {
		if (this.#res.headersSent) return;

		const isOptions = this.method === 'OPTIONS';
		const headerRules = headers ?? this.#options.headers;

		if (isOptions || this.status === 405) {
			this.#header('allow', SUPPORTED_METHODS.join(', '));
		}

		if (!isOptions) {
			contentType ??= typeForFilePath(localPath).toString();
			this.#header('content-type', contentType);
		}

		if (cors ?? this.#options.cors) {
			this.#setCorsHeaders();
		}

		if (localPath && headerRules.length) {
			const blockList = ['content-encoding', 'content-length'];
			for (const { name, value } of fileHeaders(localPath, headerRules)) {
				if (!blockList.includes(name.toLowerCase())) {
					this.#header(name, value, false);
				}
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

	/** @returns {ReqResMeta} */
	data() {
		const { startedAt, endedAt, status, method, url, urlPath, file, error } = this;
		return { startedAt, endedAt, status, method, url, urlPath, file, error };
	}
}

/**
 * @param {{ accept?: string | string[]; isText?: boolean; statSize?: number }} data
 * @returns {boolean}
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
 * @param {string} localPath
 * @param {ServerOptions['headers']} rules
 * @param {string[]} [blockList]
 */
export function fileHeaders(localPath, rules, blockList = []) {
	/** @type {Array<{name: string; value: string}>}  */
	const headers = [];
	for (const rule of rules) {
		if (Array.isArray(rule.include)) {
			const matcher = new PathMatcher(rule.include);
			if (!matcher.test(localPath)) continue;
		}
		for (const [name, value] of Object.entries(rule.headers)) {
			if (blockList.length && blockList.includes(name.toLowerCase())) continue;
			headers.push({ name, value });
		}
	}
	return headers;
}

/**
 * @param {Pick<IncomingMessage, 'method' | 'headers'>} req
 */
function isPreflight({ method, headers }) {
	return (
		method === 'OPTIONS' &&
		typeof headers['origin'] === 'string' &&
		typeof headers['access-control-request-method'] === 'string'
	);
}

/**
 * @param {string} [input]
 * @returns {string[]}
 */
function parseHeaderNames(input = '') {
	const isHeader = (h = '') => /^[A-Za-z\d-_]+$/.test(h);
	return input
		.split(',')
		.map((h) => h.trim())
		.filter(isHeader);
}
