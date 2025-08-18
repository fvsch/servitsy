import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import { open, stat, type FileHandle } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { createGzip, gzipSync } from 'node:zlib';

import { MAX_COMPRESS_SIZE, SUPPORTED_METHODS } from './constants.ts';
import { getContentType, typeForFilePath } from './content-type.ts';
import { dirListPage, errorPage } from './pages.ts';
import { FileResolver } from './resolver.ts';
import type {
	FSKind,
	FSLocation,
	HttpHeaderRule,
	Request,
	Response,
	ResMetaData,
	RuntimeOptions,
	TrailingSlash,
} from './types.d.ts';
import { fwdSlash, getLocalPath, headerCase, isSubpath, PathMatcher, trimSlash } from './utils.ts';

interface Config {
	req: Request;
	res: Response;
	resolver: FileResolver;
	options: RuntimeOptions;
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
	#file: FSLocation | null = null;

	timing: ResMetaData['timing'] = { start: Date.now() };
	url?: URL;
	localUrl?: URL;
	error?: Error | string;

	_canRedirect = true;
	_canStream = true;

	constructor({ req, res, resolver, options }: Config) {
		this.#req = req;
		this.#res = res;
		this.#resolver = resolver;
		this.#options = options;

		try {
			// If the request object is from express or a similar framework
			// (e.g. if using servitsy as middleware), the 'req.url' value may
			// be rewritten. The real URL is in req.originalUrl.
			this.url = urlFromPath(req.originalUrl ?? req.url ?? '');
			this.localUrl = urlFromPath(req.url ?? '');
		} catch (err: any) {
			this.error = err;
		}

		res.on('close', () => {
			this.timing.close = Date.now();
		});
	}

	get file(): FSLocation | null {
		return this.#file?.target ?? this.#file;
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

	async process() {
		// bail for unsupported http methods
		if (!SUPPORTED_METHODS.includes(this.method)) {
			this.status = 405;
			this.error = new Error(`HTTP method ${this.method} is not supported`);
			return this.#sendErrorPage();
		}

		// bail if something went wrong in constructor
		if (!this.url || !this.localUrl || this.error) {
			this.status = 400;
			this.error ??= new Error('Invalid request');
			return this.#sendErrorPage();
		}

		// no need to look up files for the '*' OPTIONS request
		if (this.method === 'OPTIONS' && this.#req.url === '*') {
			this.status = 204;
			this.#setHeaders('*');
			return this.#send();
		}

		// make sure the url path is valid
		const searchPath = this.localUrl.pathname.replace(/\/{2,}/g, '/');
		if (!isValidUrlPath(searchPath)) {
			this.status = 400;
			this.error = new Error(`Invalid URL path: '${searchPath}'`);
			return this.#sendErrorPage();
		}

		// search for files
		const result = await this.#resolver.find(decodeURIComponent(searchPath));
		this.#file = result.file;
		this.status = result.status;

		// redirect multiple slashes, missing/extra trailing slashes
		if (this._canRedirect) {
			const location = redirectSlash(this.url, {
				file: this.#file,
				slash: this.#options.trailingSlash,
			});
			if (location != null) {
				return this.#redirect(location);
			}
		}

		if (this.status === 200 && this.file) {
			const { kind, filePath } = this.file;
			// found a file to serve
			if (kind === 'file') {
				return this.#sendFile(filePath);
			}
			// found a directory that we can show a listing for
			if (kind === 'dir' && this.#options.list) {
				return this.#sendListPage(filePath);
			}
		}

		return this.#sendErrorPage();
	}

	async #redirect(location: string) {
		this.status = 307;
		this.#header('location', location);
		return this.#send();
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
		});

		if (this.method === 'OPTIONS') {
			this.status = 204;
		}
		// read file
		else if (this.method !== 'HEAD' && this._canStream) {
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
		const body = dirListPage({
			filePath,
			items: await this.#resolver.index(filePath),
			urlPath: this.url?.pathname ?? '',
			ext: this.#options.ext,
			root: this.#options.root,
		});
		return this.#send({ body, isText: true });
	}

	async #sendErrorPage(): Promise<void> {
		this.#setHeaders('error.html', {
			headers: [],
		});
		if (this.method === 'OPTIONS') {
			return this.#send();
		}
		const body = errorPage({
			status: this.status,
			url: this.url?.href ?? '',
			urlPath: this.url?.pathname ?? '',
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
			this.#options.gzip && canCompress({ headers: this.#req.headers, isText, statSize });

		// Send file contents if already available
		if (typeof body === 'string' || Buffer.isBuffer(body)) {
			let buf = typeof body === 'string' ? Buffer.from(body) : body;
			if (compress) {
				buf = gzipSync(buf);
				this.#header('content-encoding', 'gzip');
			}
			this.#header('content-length', buf.byteLength);
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
		config: Partial<{
			contentType: string;
			cors: boolean;
			headers: RuntimeOptions['headers'];
		}> = {},
	) {
		if (this.#res.headersSent) return;

		const isOptions = this.method === 'OPTIONS';
		if (isOptions || this.status === 405) {
			this.#header('allow', SUPPORTED_METHODS.join(', '));
		}

		if (!isOptions) {
			const type = config.contentType ?? typeForFilePath(filePath);
			this.#header('content-type', type.toString());
		}

		if (config.cors ?? this.#options.cors) {
			this.#setCorsHeaders();
		}

		const rules = config.headers ?? this.#options.headers;
		const path = getLocalPath(this.#options.root, filePath);
		if (path != null && rules.length) {
			const headers = fileHeaders(path, rules, ['content-encoding', 'content-length']);
			for (const { name, value } of headers) {
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
			url: this.url?.href ?? '',
			urlPath: this.url?.pathname ?? '',
			localPath: this.localPath,
			timing: structuredClone(this.timing),
			error: this.error,
		};
	}
}

function canCompress({
	headers,
	isText,
	statSize = 0,
}: {
	headers: Request['headers'];
	isText: boolean;
	statSize?: number;
}) {
	if (!isText || statSize > MAX_COMPRESS_SIZE) return false;
	for (const header of pickHeader(headers, 'accept-encoding')) {
		const names = header.split(',').map((value) => value.split(';')[0].trim().toLowerCase());
		if (names.includes('gzip')) return true;
	}
	return false;
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

function pickHeader(headers: Request['headers'], name: string): string[] {
	const value = headers[name];
	return typeof value === 'string' ? [value] : (value ?? []);
}

export function redirectSlash(
	url: URL | null,
	{ file, slash }: { file: FSLocation | null; slash: TrailingSlash },
): string | undefined {
	if (!url || url.pathname.length < 2 || !file) return;
	const { kind, filePath } = file;

	let urlPath = url.pathname.replace(/\/{2,}/g, '/');
	const trailing = urlPath.endsWith('/');

	let aye = slash === 'always';
	let nay = slash === 'never';

	if (slash === 'auto' && file) {
		if (file.kind === 'dir') {
			aye = true;
		} else if (file.kind === 'file') {
			const fileName = basename(file.filePath);
			const parentName = basename(dirname(file.filePath));
			if (urlPath.endsWith(`/${fileName}`)) {
				nay = true;
			} else if (urlPath.endsWith(`/${parentName}`) || urlPath.endsWith(`/${parentName}/`)) {
				aye = true;
			}
			if (urlPath.startsWith('/TEST/')) {
				console.log({
					file,
					urlPath,
					fileName,
					parentName,
					nay,
					aye,
					endsWithFileName: urlPath.endsWith(`/${fileName}`),
					endsWithParentName:
						urlPath.endsWith(`/${parentName}`) || urlPath.endsWith(`/${parentName}/`),
				});
			}
		}
	}

	if (aye && !trailing) {
		urlPath += '/';
	} else if (nay && trailing) {
		urlPath = urlPath.replace(/\/$/, '') || '/';
	}

	if (urlPath !== url.pathname) {
		return `${urlPath}${url.search}${url.hash}`;
	}
}

function urlFromPath(urlPath: string, base: string = 'http://localhost/') {
	if (!base.endsWith('/')) base += '/';
	let url = urlPath.trim();
	if (url.startsWith('//')) url = base + url.slice(1);
	return new URL(url, base);
}
