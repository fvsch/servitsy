import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import { open, stat, type FileHandle } from 'node:fs/promises';
import { createGzip, gzipSync } from 'node:zlib';

import { MAX_COMPRESS_SIZE, SUPPORTED_METHODS } from './constants.ts';
import { getContentType, typeForFilePath } from './content-type.ts';
import { dirListPage, errorPage } from './pages.ts';
import { FileResolver } from './resolver.ts';
import type {
	FSLocation,
	HttpHeaderRule,
	Request,
	Response,
	ResMetaData,
	ServerOptions,
} from './types.d.ts';
import { getLocalPath, headerCase, isSubpath, PathMatcher, trimSlash } from './utils.ts';

interface Config {
	req: Request;
	res: Response;
	resolver: FileResolver;
	options: Required<ServerOptions> & { _noStream?: boolean };
}

interface Payload {
	body?: string | Buffer | import('node:fs').ReadStream;
	contentType?: string;
	isText?: boolean;
	statSize?: number;
}

export class RequestHandler {
	#req: Config['req'];
	#res: Config['res'];
	#resolver: Config['resolver'];
	#options: Config['options'];

	timing: ResMetaData['timing'] = { start: Date.now() };
	urlPath: string | null = null;
	file: FSLocation | null = null;
	error?: Error | string;

	constructor({ req, res, resolver, options }: Config) {
		this.#req = req;
		this.#res = res;
		this.#resolver = resolver;
		this.#options = options;

		try {
			this.urlPath = extractUrlPath(req.url ?? '');
		} catch (err: any) {
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

	async #sendFile(filePath: string) {
		let handle: FileHandle | undefined;
		let data: Payload = {};

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
		} catch (err: any) {
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

	async #sendListPage(filePath: string) {
		this.#setHeaders('index.html', {
			cors: false,
			headers: [],
		});
		if (this.method === 'OPTIONS') {
			this.status = 204;
			return this.#send();
		}
		const items = await this.#resolver.index(filePath);
		const body = dirListPage({
			root: this.#options.root,
			ext: this.#options.ext,
			urlMount: urlMountPath(this.#req),
			urlPath: this.urlPath ?? '',
			filePath,
			items,
		});
		return this.#send({ body, isText: true });
	}

	async #sendErrorPage(): Promise<void> {
		this.#setHeaders('error.html', {
			cors: this.#options.cors,
			headers: [],
		});
		if (this.method === 'OPTIONS') {
			return this.#send();
		}
		const body = errorPage({
			status: this.status,
			url: this.#req.url ?? '',
			urlPath: this.urlPath,
		});
		return this.#send({ body, isText: true });
	}

	#send({ body, isText = false, statSize }: Payload = {}) {
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

	#header(name: string, value: null | number | string | string[], normalizeCase = true) {
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
	*/
	#setHeaders(
		filePath: string,
		options: Partial<{ contentType: string; cors: boolean; headers: ServerOptions['headers'] }>,
	) {
		if (this.#res.headersSent) return;
		const { contentType, cors, headers } = options;

		const isOptions = this.method === 'OPTIONS';
		const headerRules = headers ?? this.#options.headers;

		if (isOptions || this.status === 405) {
			this.#header('allow', SUPPORTED_METHODS.join(', '));
		}

		if (!isOptions) {
			const value = contentType ?? typeForFilePath(filePath).toString();
			this.#header('content-type', value);
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

	data(): ResMetaData {
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

function canCompress({
	accept = '',
	statSize = 0,
	isText = false,
}: {
	accept?: string | string[];
	isText?: boolean;
	statSize?: number;
}): boolean {
	accept = Array.isArray(accept) ? accept.join(',') : accept;
	if (isText && statSize <= MAX_COMPRESS_SIZE && accept) {
		return accept
			.toLowerCase()
			.split(',')
			.some((value) => value.split(';')[0].trim() === 'gzip');
	}
	return false;
}

export function extractUrlPath(url: string): string {
	if (url === '*') return url;
	const path = new URL(url, 'http://localhost/').pathname || '/';
	if (!isValidUrlPath(path)) {
		throw new Error(`Invalid URL path: '${path}'`);
	}
	return path;
}

export function fileHeaders(localPath: string, rules: HttpHeaderRule[], blockList: string[] = []) {
	const result: Array<{ name: string; value: string }> = [];
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

function isPreflight(req: Pick<Request, 'method' | 'headers'>): boolean {
	return (
		req.method === 'OPTIONS' &&
		typeof req.headers['origin'] === 'string' &&
		typeof req.headers['access-control-request-method'] === 'string'
	);
}

export function isValidUrlPath(urlPath: string): boolean {
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

function parseHeaderNames(input: string = ''): string[] {
	const isHeader = (h = '') => /^[A-Za-z\d-_]+$/.test(h);
	return input
		.split(',')
		.map((h) => h.trim())
		.filter(isHeader);
}

export function urlMountPath({
	baseUrl,
	originalUrl,
	url,
}: Pick<Request, 'baseUrl' | 'originalUrl' | 'url'>): string | undefined {
	const trim = (p = '') => (p.length > 1 ? trimSlash(p, { end: true }) : p);
	if (typeof baseUrl === 'string') {
		return trim(baseUrl);
	} else if (typeof url === 'string' && typeof originalUrl === 'string') {
		if (url === '' || url === '/') return trim(originalUrl);
		const lastIndex = originalUrl.lastIndexOf(url);
		if (lastIndex > 0) return trim(originalUrl.slice(0, lastIndex));
	}
}
