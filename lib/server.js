import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';

import { SUPPORTED_METHODS } from './constants.js';
import { getContentType, typeForFilePath } from './content-type.js';
import { fsProxy } from './fs-proxy.js';
import { dirListPage, errorPage } from './pages.js';
import { FileResolver, PathMatcher } from './resolver.js';
import { headerCase, strBytes } from './utils.js';

/**
@typedef {import('node:fs/promises').FileHandle} FileHandle
@typedef {import('node:http').IncomingMessage} IncomingMessage
@typedef {import('node:http').Server} Server
@typedef {import('node:http').ServerResponse} ServerResponse
@typedef {import('./types.js').DirIndexItem} DirIndexItem
@typedef {import('./types.js').FSEntryKind} FSEntryKind
@typedef {import('./types.js').ReqResMeta} ReqResMeta
@typedef {import('./types.js').ResolvedFile} ResolvedFile
@typedef {import('./types.js').ResolveResult} ResolveResult
@typedef {import('./types.js').ServerOptions} ServerOptions
**/

/**
 * @param {ServerOptions} options
 * @param {{ logNetwork?: (data: ReqResMeta) => void }} [callbacks]
 * @returns {Server}
 */
export function staticServer(options, { logNetwork } = {}) {
	const resolver = new FileResolver(options, fsProxy);

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
	 * @param {ServerOptions & {_dryRun?: boolean}} options
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
		/** @type {string | undefined} */
		let contentType;
		/** @type {number | undefined} */
		let contentLength;
		try {
			// check that we can actually open the file
			// (especially on windows where it might be busy)
			handle = await this.#resolver.open(file.filePath);
			contentType = await getContentType({ filePath: file.filePath, fileHandle: handle });
			contentLength = (await handle.stat()).size;
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

		if (this.method === 'OPTIONS') {
			this.status = 204;
		}

		this.#setHeaders(file.localPath ?? file.filePath, {
			contentType,
			contentLength,
			cors: this.#options.cors,
			headers: this.#options.headers,
		});

		if (this.#options._dryRun) {
			return;
		} else if (this.method === 'OPTIONS' || this.method === 'HEAD') {
			return this.#send();
		} else {
			return this.#send(this.#resolver.readStream(file.filePath));
		}
	}

	/**
	 * @param {ResolvedFile} dir
	 */
	async #sendListPage(dir) {
		const items = await this.#resolver.index(dir.filePath);
		let body;
		let contentLength;
		if (this.method !== 'OPTIONS') {
			body = await dirListPage({ urlPath: this.urlPath, file: dir, items }, this.#options);
			contentLength = strBytes(body);
		}
		this.#setHeaders('index.html', {
			contentLength,
			cors: false,
			headers: [],
		});
		return this.#send(body);
	}

	async #sendErrorPage() {
		let body;
		let contentLength;
		if (this.method !== 'OPTIONS') {
			body = await errorPage({ status: this.status, urlPath: this.urlPath });
			contentLength = strBytes(body);
		}
		this.#setHeaders('error.html', {
			contentLength,
			cors: this.#options.cors,
			headers: [],
		});
		return this.#send(body);
	}

	/**
	 * @param {string | import('node:buffer').Buffer | import('node:fs').ReadStream} [contents]
	 */
	#send(contents) {
		if (this.method === 'HEAD' || this.method === 'OPTIONS') {
			this.#res.end();
		} else if (this.#req.destroyed) {
			this.#setHeader('content-length', '0');
			this.#res.end();
		} else if (typeof contents === 'string' || Buffer.isBuffer(contents)) {
			this.#res.write(contents);
			this.#res.end();
		} else if (typeof contents?.pipe === 'function') {
			contents.pipe(this.#res);
		}
	}

	/**
	 * @param {string} name
	 * @param {number | string | string[]} value
	 */
	#setHeader(name, value) {
		if (this.#res.headersSent) return;
		this.#res.setHeader(headerCase(name), value);
	}

	/**
	 * @param {string} localPath
	 * @param {Partial<{ contentType: string, contentLength: number; cors: boolean; headers: ServerOptions['headers'] }>} options
	 */
	#setHeaders(localPath, { contentLength, contentType, cors, headers }) {
		if (this.#res.headersSent) return;

		const isOptions = this.method === 'OPTIONS';
		const headerRules = headers ?? this.#options.headers;

		if (isOptions || this.status === 405) {
			this.#setHeader('allow', SUPPORTED_METHODS.join(', '));
		}
		if (!isOptions) {
			contentType ??= typeForFilePath(localPath).toString();
			this.#setHeader('content-type', contentType);
		}
		if (isOptions || this.status === 204) {
			contentLength = 0;
		}
		if (typeof contentLength === 'number') {
			this.#setHeader('content-length', String(contentLength));
		}
		if (cors ?? this.#options.cors) {
			this.#setCorsHeaders();
		}
		if (localPath && headerRules.length) {
			for (const { name, value } of fileHeaders(localPath, headerRules)) {
				this.#res.setHeader(name, value);
			}
		}
	}

	#setCorsHeaders() {
		const origin = this.#req.headers['origin'];
		if (typeof origin === 'string') {
			this.#setHeader('access-control-allow-origin', origin);
		}

		if (isPreflight(this.#req)) {
			this.#setHeader('access-control-allow-methods', SUPPORTED_METHODS.join(', '));
			const allowHeaders = parseHeaderNames(this.#req.headers['access-control-request-headers']);
			if (allowHeaders.length) {
				this.#setHeader('access-control-allow-headers', allowHeaders.join(', '));
			}
			this.#setHeader('access-control-max-age', '60');
		}
	}

	/** @returns {ReqResMeta} */
	data() {
		const { startedAt, endedAt, status, method, url, urlPath, file, error } = this;
		return { startedAt, endedAt, status, method, url, urlPath, file, error };
	}
}

/**
 * @param {string} localPath
 * @param {ServerOptions['headers']} rules
 */
export function fileHeaders(localPath, rules) {
	/** @type {Array<{name: string; value: string}>}  */
	const headers = [];
	for (const rule of rules) {
		if (Array.isArray(rule.include)) {
			const matcher = new PathMatcher(rule.include);
			if (!matcher.test(localPath)) continue;
		}
		for (const [name, value] of Object.entries(rule.headers)) {
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
