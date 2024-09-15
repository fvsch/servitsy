import { open } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { getContentType, typeForFilePath } from './content-type.js';
import { fsUtils } from './node-fs.js';
import { dirListPage, errorPage } from './pages.js';
import { FileResolver, PathMatcher } from './resolver.js';

/**
@typedef {import('./types.js').DirIndexItem} DirIndexItem
@typedef {import('./types.js').FSEntryKind} FSEntryKind
@typedef {import('./types.js').ReqResInfo} ReqResInfo
@typedef {import('./types.js').ResolveResult} ResolveResult
@typedef {import('./types.js').ServerOptions} ServerOptions
**/

/**
 * @param {ServerOptions} options
 * @param {{ logNetwork?: (info: ReqResInfo) => void }} callbacks
 * @returns {import('node:http').Server}
 */
export function staticServer(options, { logNetwork }) {
	const resolver = new FileResolver(options, fsUtils);

	return createServer(async (req, res) => {
		/**
		 * @type {Pick<ReqResInfo, 'method' | 'startedAt' | 'error'>}
		 */
		const logInfo = {
			method: req.method ?? '',
			startedAt: Date.now(),
		};

		const { file, ...result } = await resolver.find(req.url ?? '');

		if (logNetwork) {
			res.on('close', () => {
				logNetwork({
					status: result.status,
					urlPath: result.urlPath,
					localPath: file?.localPath ?? null,
					...logInfo,
					endedAt: Date.now(),
				});
			});
		}

		// found a file to serve
		if (
			result.status === 200 &&
			file?.kind === 'file' &&
			file.filePath != null &&
			file.localPath != null
		) {
			let fileHandle;
			try {
				// check that we can actually open the file
				// (especially on windows where it might be busy)
				fileHandle = await open(file.filePath);
				const headers = fileHeaders({
					localPath: file.localPath,
					contentType: await getContentType({
						filePath: file.localPath,
						fileHandle,
					}),
					cors: options.cors,
					headers: options.headers,
				});
				res.writeHead(result.status, headers);
				const stream = fileHandle.createReadStream({
					autoClose: true,
					start: 0,
				});
				stream.pipe(res);
			} catch (/** @type {any} */ err) {
				result.status = 500;
				if (err?.syscall === 'open') {
					if (err.code === 'EBUSY') result.status = 403;
					fileHandle?.close();
				}
				if (err?.message) {
					logInfo.error = err;
				}
				await sendErrorPage(res, result, options);
			}
		}

		// found a directory that we can show a listing for
		else if (
			result.status === 200 &&
			file?.kind === 'dir' &&
			file.filePath != null &&
			file.localPath != null
		) {
			await sendDirListPage(
				res,
				{
					status: result.status,
					filePath: file.filePath,
					localPath: file.localPath,
					items: await resolver.index(file.filePath),
				},
				options,
			);
		}

		// show an error page
		else {
			await sendErrorPage(res, result, options);
		}
	});
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {{ status: number, filePath: string; localPath: string; items: DirIndexItem[] }} data
 * @param {ServerOptions} options
 */
async function sendDirListPage(res, data, options) {
	const headers = fileHeaders({
		localPath: join(data.localPath, 'index.html'),
		// ignore user options for directory listings
		cors: false,
		headers: [],
	});
	const body = await dirListPage(
		{
			filePath: data.filePath,
			localPath: data.localPath,
			items: data.items,
		},
		options,
	);
	res.writeHead(data.status, headers);
	res.write(body);
	res.end();
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {Pick<ResolveResult, 'status' | 'urlPath'>} result
 * @param {ServerOptions} options
 */
async function sendErrorPage(res, result, options) {
	const headers = fileHeaders({
		localPath: 'error.html',
		cors: options.cors,
		// ignore custom headers for error pages
		headers: [],
	});
	const body = await errorPage(result);
	res.writeHead(result.status, headers);
	res.write(body);
	res.end();
}

/**
 * @param {{ localPath: string; contentType?: string; cors: boolean; headers: ServerOptions['headers'] }} data
 * @returns {Record<string, string>}
 */
export function fileHeaders({ localPath, contentType, cors, headers }) {
	/** @type {Record<string, string>} */
	const obj = {};
	const add = (key = '', value = '') => (obj[key.trim().toLowerCase()] = value);
	add('content-type', contentType || typeForFilePath(localPath).toString());
	if (cors) {
		add('access-control-allow-origin', '*');
	}
	for (const rule of headers) {
		if (Array.isArray(rule.include)) {
			const matcher = new PathMatcher(rule.include);
			if (!matcher.test(localPath)) continue;
		}
		for (const [key, value] of Object.entries(rule.headers)) {
			add(key, value);
		}
	}
	return obj;
}
