import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { dirListPage, errorPage } from './html/pages.js';
import { fsUtils } from './node-fs.js';
import { FileResolver, PathMatcher } from './resolver.js';
import { contentType } from './utils.js';

/**
@typedef {import('./types.js').FSEntryKind} FSEntryKind
@typedef {import('./types.js').ServerOptions} ServerOptions
@typedef {import('./resolver.js').ResolveResult} ResolveResult

@typedef {{
	startedAt: number;
	endedAt: number;
	root: string;
  method: string;
  status: number;
  urlPath: string;
  filePath?: string;
}} ReqResInfo
**/

/**
 * @param {ServerOptions} options
 * @param {{ logNetwork?: (info: ReqResInfo) => void }} callbacks
 * @returns {ReturnType<createServer>}
 */
export function staticServer(options, { logNetwork }) {
	const resolver = new FileResolver(options, fsUtils);

	return createServer(async (req, res) => {
		const startedAt = Date.now();
		const result = await resolver.find(req.url ?? '/');

		if (logNetwork) {
			res.on('close', () =>
				logNetwork({
					startedAt,
					endedAt: Date.now(),
					root: options.root,
					method: req.method ?? '',
					status: result.status,
					urlPath: result.urlPath,
					filePath: result.filePath ?? '',
				}),
			);
		}

		// found a file to serve
		if (result.kind === 'file' && result.status === 200 && result.filePath) {
			const headers = fileHeaders(result.filePath, options);
			const stream = createReadStream(result.filePath);
			res.writeHead(result.status, headers);
			stream.pipe(res);
		}

		// found a directory that we can show a listing for
		else if (result.kind === 'dir' && result.status === 200 && result.filePath) {
			const headers = fileHeaders(
				join(result.filePath, 'index.html'),
				// ignore user options for directory listings
				{ cors: false, headers: [] },
			);
			const body = await dirListPage({
				root: options.root,
				dirPath: result.filePath,
				items: await resolver.index(result.filePath),
				ext: options.ext,
			});
			res.writeHead(result.status, headers);
			res.write(body);
			res.end();
		}

		// show an error page
		else {
			const headers = fileHeaders(
				join(options.root, 'error.html'),
				// ignore custom headers for error pages
				{ cors: options.cors, headers: [] },
			);
			const body = await errorPage({
				status: result.status,
				urlPath: result.urlPath,
			});
			res.writeHead(result.status, headers);
			res.write(body);
			res.end();
		}
	});
}

/**
 * @param {string} filePath
 * @param {Pick<ServerOptions, 'headers' | 'cors'>} options
 * @returns {Record<string, string>}
 */
export function fileHeaders(filePath, { cors, headers }) {
	/** @type {Record<string, string>} */
	const result = {};
	const setHeader = (key = '', value = '') => (result[key.toLowerCase()] = value);
	setHeader('content-type', contentType(filePath));
	if (cors) {
		setHeader('access-control-allow-origin', '*');
	}
	for (const rule of headers) {
		if (Array.isArray(rule.include)) {
			const matcher = new PathMatcher(rule.include);
			if (!matcher.test(filePath)) continue;
		}
		for (const [key, value] of Object.entries(rule.headers)) {
			setHeader(key, value);
		}
	}
	return result;
}
