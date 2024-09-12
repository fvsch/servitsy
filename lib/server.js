import { open } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { fsUtils } from './node-fs.js';
import { dirListPage, errorPage } from './pages.js';
import { FileResolver, PathMatcher } from './resolver.js';
import { contentType } from './utils.js';

/**
@typedef {import('./types.js').FSEntryKind} FSEntryKind
@typedef {import('./types.js').ReqResInfo} ReqResInfo
@typedef {import('./types.js').ResolveResult} ResolveResult
@typedef {import('./types.js').ServerOptions} ServerOptions
**/

/**
 * @param {ServerOptions} options
 * @param {{ logNetwork?: (info: ReqResInfo) => void }} callbacks
 * @returns {ReturnType<createServer>}
 */
export function staticServer(options, { logNetwork }) {
	const resolver = new FileResolver(options, fsUtils);

	return createServer(async (req, res) => {
		/** @type {Pick<ReqResInfo, 'root' | 'method' | 'startedAt' | 'error'>} */
		const info = {
			root: options.root,
			method: req.method ?? '',
			startedAt: Date.now(),
		};

		const urlPath =
			typeof req.url === 'string' ? new URL(req.url, 'http://localhost/').pathname : '/';
		const result = await resolver.find(urlPath);

		if (logNetwork) {
			res.on('close', () =>
				logNetwork({
					...result,
					...info,
					endedAt: Date.now(),
				}),
			);
		}

		// found a file to serve
		if (result.kind === 'file' && result.status === 200 && result.filePath) {
			try {
				// check that we can actually open the file
				// (especially on windows where it might be busy)
				const fileHandle = await open(result.filePath);
				const stream = fileHandle.createReadStream();
				const headers = fileHeaders(result.filePath, options);
				res.writeHead(result.status, headers);
				stream.pipe(res);
			} catch (/** @type {any} */ err) {
				result.status = 500;
				if (err?.syscall === 'open' && err.code === 'EBUSY') {
					result.status = 403;
				}
				if (err?.message) {
					info.error = err;
				}
				await sendErrorPage(res, result, options);
			}
		}

		// found a directory that we can show a listing for
		else if (result.kind === 'dir' && result.status === 200 && result.filePath) {
			const headers = fileHeaders(
				join(result.filePath, 'index.html'),
				// ignore user options for directory listings
				{ cors: false, headers: [] },
			);
			const body = await dirListPage(
				{
					urlPath: result.urlPath,
					dirPath: result.filePath,
					items: await resolver.index(result.filePath),
				},
				options,
			);
			res.writeHead(result.status, headers);
			res.write(body);
			res.end();
		}

		// show an error page
		else {
			await sendErrorPage(res, result, options);
		}
	});
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {ResolveResult} result
 * @param {ServerOptions} options
 */
async function sendErrorPage(res, result, options) {
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
