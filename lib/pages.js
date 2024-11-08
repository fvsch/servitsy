import { basename, dirname } from 'node:path';

import { FAVICON_LIST, FAVICON_ERROR, ICONS, STYLES } from './page-assets.js';
import { clamp, escapeHtml, trimSlash } from './utils.js';

/**
@typedef {import('./types.d.ts').FSLocation} FSLocation
@typedef {import('./types.d.ts').ServerOptions} ServerOptions
*/

/**
@param {{ base?: string; body: string; icon?: 'list' | 'error'; title?: string }} data
*/
async function htmlTemplate({ base, body, icon, title }) {
	const svgIcon = { list: FAVICON_LIST, error: FAVICON_ERROR }[String(icon)];
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
${title ? `<title>${html(title)}</title>` : ''}
${base ? `<base href="${attr(base)}">` : ''}
<meta name="viewport" content="width=device-width">
${svgIcon ? `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${btoa(svgIcon)}">` : ''}
<style>${STYLES}</style>
</head>
<body>
${ICONS}
${body}
</body>
</html>
`;
}

/**
@param {{ status: number, urlPath: string }} data
@returns {Promise<string>}
*/
export function errorPage({ status, urlPath }) {
	const displayPath = decodeURIPathSegments(urlPath);
	const pathHtml = `<code class="filepath">${html(nl2sp(displayPath))}</code>`;

	const page = (title = '', desc = '') => {
		const body = `<h1>${html(title)}</h1>\n<p>${desc}</p>\n`;
		return htmlTemplate({ icon: 'error', title, body });
	};

	switch (status) {
		case 403:
			return page('403: Forbidden', `Could not access ${pathHtml}`);
		case 404:
			return page('404: Not found', `Could not find ${pathHtml}`);
		case 405:
			return page('405: Method not allowed');
		case 500:
			return page('500: Error', `Could not serve ${pathHtml}`);
		default:
			return page('Error', 'Something went wrong');
	}
}

/**
@param {{ urlPath: string; filePath: string; items: FSLocation[] }} data
@param {Pick<ServerOptions, 'root' | 'ext'>} options
@returns {Promise<string>}
*/
export function dirListPage({ urlPath, filePath, items }, options) {
	const rootName = basename(options.root);
	const trimmedUrl = trimSlash(urlPath);
	const baseUrl = trimmedUrl ? `/${trimmedUrl}/` : '/';

	const displayPath = decodeURIPathSegments(trimmedUrl ? `${rootName}/${trimmedUrl}` : rootName);
	const parentPath = dirname(filePath);
	const showParent = trimmedUrl !== '';

	const sorted = [...items.filter((x) => isDirLike(x)), ...items.filter((x) => !isDirLike(x))];
	if (showParent) {
		sorted.unshift({ filePath: parentPath, kind: 'dir' });
	}

	// Make sure we have at least 2 items to put in each CSS column
	const maxCols = clamp(Math.ceil(sorted.length / 3), 1, 4);

	return htmlTemplate({
		title: `Index of ${displayPath}`,
		icon: 'list',
		base: baseUrl,
		body: `
<h1>
	Index of <span class="bc">${renderBreadcrumbs(displayPath)}</span>
</h1>
<ul class="files" style="--max-col-count:${maxCols}">
${sorted.map((item) => renderListItem(item, { ext: options.ext, parentPath })).join('\n')}
</ul>
`.trim(),
	});
}

/**
@type {(item: FSLocation, options: { ext: ServerOptions['ext']; parentPath: string }) => string}
*/
function renderListItem(item, { ext, parentPath }) {
	const isDir = isDirLike(item);
	const isParent = isDir && item.filePath === parentPath;

	let icon = isDir ? 'icon-dir' : 'icon-file';
	if (item.kind === 'link') icon += '-link';
	let name = basename(item.filePath);
	let suffix = '';
	let label = '';
	let href = encodeURIComponent(name);

	if (isParent) {
		name = '..';
		href = '..';
		label = 'Parent directory';
	}
	if (isDir) {
		suffix = '/';
	} else {
		// clean url: remove extension if possible
		const match = ext.find((e) => item.filePath.endsWith(e));
		if (match) href = href.slice(0, href.length - match.length);
	}

	return [
		`<li class="files-item">\n`,
		`<a class="files-link" href="${attr(href)}"${label && ` aria-label="${attr(label)}" title="${attr(label)}"`}>`,
		`<svg class="files-icon" width="20" height="20"><use xlink:href="#${attr(icon)}"></use></svg>`,
		`<span class="files-name filepath">${html(nl2sp(name))}${suffix && `<span>${html(suffix)}</span>`}</span>`,
		`</a>`,
		`\n</li>`,
	].join('');
}

/** @type {(path: string) => string} */
function renderBreadcrumbs(path) {
	const slash = '<span class="bc-sep">/</span>';
	return path
		.split('/')
		.filter(Boolean)
		.map((part, index, parts) => {
			const distance = parts.length - index - 1;
			if (distance <= 0) {
				return `<span class="bc-current filepath">${html(nl2sp(part))}</span>`;
			}
			const href = Array(distance).fill('..').join('/');
			return `<a class="bc-link filepath" href="${attr(href)}">${html(nl2sp(part))}</a>`;
		})
		.join(slash);
}

/** @type {(item: FSLocation) => boolean} */
function isDirLike(item) {
	return item.kind === 'dir' || (item.kind === 'link' && item.target?.kind === 'dir');
}

/** @type {(s: string) => string} */
function decodeURIPathSegment(s) {
	return decodeURIComponent(s).replaceAll('\\', '\\\\').replaceAll('/', '\\/');
}

/** @type {(path: string) => string} */
function decodeURIPathSegments(path) {
	return path.split('/').map(decodeURIPathSegment).join('/');
}

/** @type {(input: string) => string} */
function attr(str) {
	return escapeHtml(str, 'attr');
}

/** @type {(input: string) => string} */
function html(str) {
	return escapeHtml(str, 'text');
}

/** @type {(input: string) => string} */
function nl2sp(input) {
	return input.replace(/[\u{000A}-\u{000D}\u{2028}]/gu, ' ');
}
