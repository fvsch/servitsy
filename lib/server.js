import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { basename, extname, relative } from 'node:path';

import { fsUtils, readAsset } from './node-fs.js';
import { FileResolver } from './resolver.js';
import { clamp, contentType } from './utils.js';

/**
@typedef {import('./types.js').FSEntryKind} FSEntryKind
@typedef {import('./types.js').ResolveOptions} ResolveOptions

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
 * @param {{ root: string; cors?: boolean } & ResolveOptions} options
 * @param {{ logNetwork?: (info: ReqResInfo) => void }} callbacks
 * @returns {ReturnType<createServer>}
 */
export function staticServer({ cors, ...resolveOptions }, { logNetwork }) {
	const resolver = new FileResolver(resolveOptions, fsUtils);

	return createServer(async (req, res) => {
		const startedAt = Date.now();
		const result = await resolver.find(req.url ?? '/');

		if (logNetwork) {
			res.on('close', () =>
				logNetwork({
					startedAt,
					endedAt: Date.now(),
					root: resolveOptions.root,
					method: req.method ?? '',
					status: result.status,
					urlPath: result.urlPath,
					filePath: result.filePath ?? '',
				}),
			);
		}

		const baseHeaders = {};
		if (cors) {
			baseHeaders['access-control-allow-origin'] = '*';
		}

		/** @type {(headers: Record<string, string>) => void} */
		const writeHead = (headers) => {
			const baseHeaders = {};
			if (cors) {
				baseHeaders['access-control-allow-origin'] = '*';
			}
			res.writeHead(result.status, {
				...baseHeaders,
				...headers,
			});
		};

		// found a file to serve
		if (result.kind === 'file' && result.status === 200 && result.filePath) {
			writeHead({ 'content-type': contentType(result.filePath) });
			const stream = createReadStream(result.filePath);
			stream.pipe(res);
		}

		// found a directory that we can show a listing for
		else if (result.kind === 'dir' && result.status === 200 && result.filePath) {
			const { headers, body } = await dirIndexPage({
				root: resolveOptions.root,
				dirPath: result.filePath,
				items: await resolver.index(result.filePath),
				ext: resolveOptions.ext,
			});
			writeHead(headers);
			res.write(body);
			res.end();
		}

		// show an error page
		else {
			const { headers, body } = await errorResponse({
				status: result.status,
				urlPath: result.urlPath,
			});
			writeHead(headers);
			res.write(body);
			res.end();
		}
	});
}

/**
 * @param {{ status: number, urlPath: string }} data
 * @returns {Promise<{headers: Record<string, string>, body: string}>}
 */
async function errorResponse({ status, urlPath }) {
	let title = 'Error';
	let desc = 'Something went wrong';
	if (status === 403) {
		title = '403: Forbidden';
		desc = `Could not access <code>${urlPath}</code>`;
	} else if (status === 404) {
		title = '404: Not found';
		desc = `Could not find <code>${urlPath}</code>`;
	} else if (status === 500) {
		title = '500: Error';
		desc = `Could not serve <code>${urlPath}</code>`;
	}

	const body = await htmlTemplate({
		title,
		body: `<h1>${title}</h1>\n<p>${desc}</p>\n`,
	});

	return {
		headers: { 'content-type': contentType('error.html') },
		body,
	};
}

/**
 * @param {{ root: string; dirPath: string, items: {filePath: string; kind: FSEntryKind}[], ext?: string[] }} data
 * @returns {Promise<{headers: Record<string, string>, body: string}>}
 */
async function dirIndexPage({ root, dirPath, items, ext = [] }) {
	const rootName = basename(root);
	const dirRelPath = relative(root, dirPath);

	/** @type {(item: {filePath: string; kind: FSEntryKind}) => string} */
	const fileItem = ({ filePath, kind }) => {
		let className = kind ?? 'file';
		let text = basename(filePath);
		let suffix = kind === 'dir' ? '/' : '';
		let href = text + suffix;
		let label = '';
		if (kind === 'dir' && filePath.endsWith('..')) {
			className += ' parent';
			label = 'Parent directory';
		}
		if (kind === 'file') {
			const fileExt = extname(filePath);
			if (fileExt && ext.includes(fileExt)) {
				href = href.slice(0, href.length - fileExt.length);
			}
		}
		const parts = [
			`<li class="${className}">`,
			`<a href="${href}"${label && ` aria-label="${label}" title="${label}"`}>`,
			`<svg width="20" height="20"><use xlink:href="#icon-${kind ?? 'file'}"></use></svg>`,
			`<span>${text}${suffix && `<span>${suffix}</span>`}</span>`,
			`</a>`,
			`</li>`,
		];
		return parts.join('\n');
	};

	const dirs = items.filter((x) => x.kind === 'dir');
	const files = items.filter((x) => x.kind !== 'dir');

	if (dirRelPath) {
		dirs.unshift({ filePath: dirPath + '/..', kind: 'dir' });
	}

	// Make sure we have at least 2 items to put in each CSS column
	const maxCols = clamp(Math.ceil((dirs.length + files.length) / 3), 1, 4);

	const body = await htmlTemplate({
		title: [rootName, dirRelPath].filter(Boolean).join('/'),
		base: `/${dirRelPath}/`.replace(/\/{2,}/g, '/'),
		body: `
<h1>
	Index of ${[rootName, dirRelPath].filter(Boolean).join('/')}
</h1>
<ul class="files" style="--max-col-count:${maxCols}">
${dirs.map(fileItem).join('\n')}
${files.map(fileItem).join('\n')}
</ul>
`.trim(),
	});

	return {
		headers: { 'content-type': contentType('index.html') },
		body,
	};
}

/**
 * @param {{ base?: string; title?: string; body: string }} data
 * @returns {Promise<string>}
 */
async function htmlTemplate({ base, title, body }) {
	const [css, svg, icon] = await Promise.all([
		readAsset('server.css'),
		readAsset('server.svg'),
		readAsset('favicon.svg'),
	]);

	const head = [
		`<meta charset="UTF-8">`,
		title && `<title>${title}</title>`,
		base && `<base href="${base}">`,
		`<meta name="viewport" content="width=device-width">`,
		`<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${btoa(icon)}">`,
		`<style>${css.toString()}</style>`,
	].filter(Boolean);

	return `<!doctype html>
<html lang="en">
<head>
${head.join('\n')}
</head>
<body>
${body}
${svg.toString()}
</body>
</html>
`;
}
