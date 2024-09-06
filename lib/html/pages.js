import { readFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { clamp, escapeHtml, getDirname } from '../utils.js';

/**
@typedef {import('../types.js').FSEntryKind} FSEntryKind
**/

const html = (s = '') => escapeHtml(s, 'text');
const attr = (s = '') => escapeHtml(s, 'attr');

/**
 * @type {Map<string, string>}
 */
const assetCache = new Map();

/**
 * @param {string} file
 * @returns {Promise<string>}
 */
async function readAsset(file) {
	const fullPath = join(getDirname(import.meta.url), file);
	const cached = assetCache.get(fullPath);
	if (cached) {
		return cached;
	} else {
		const contents = await readFile(fullPath, { encoding: 'utf-8' });
		assetCache.set(fullPath, contents);
		return contents;
	}
}

/**
 * @param {{ base?: string; title?: string; body: string }} data
 * @returns {Promise<string>}
 */
async function htmlTemplate({ base, title, body }) {
	const [css, svg, icon] = await Promise.all([
		readAsset('styles.css'),
		readAsset('icons.svg'),
		readAsset('favicon.svg'),
	]);

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
${title ? `<title>${html(title)}</title>` : ''}
${base ? `<base href="${attr(base)}">` : ''}
<meta name="viewport" content="width=device-width">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${btoa(icon)}">
<style>${css.toString()}</style>
</head>
<body>
${svg.toString()}
${body}
</body>
</html>
`;
}

/**
 * @param {{ status: number, urlPath: string }} data
 * @returns {Promise<string>}
 */
export function errorPage({ status, urlPath }) {
	const path = decodeURIComponent(urlPath);

	let title = 'Error';
	let desc = 'Something went wrong';
	if (status === 403) {
		title = '403: Forbidden';
		desc = `Could not access <code class="filepath">${html(path)}</code>`;
	} else if (status === 404) {
		title = '404: Not found';
		desc = `Could not find <code class="filepath">${html(path)}</code>`;
	} else if (status === 500) {
		title = '500: Error';
		desc = `Could not serve <code class="filepath">${html(path)}</code>`;
	}

	return htmlTemplate({
		title,
		body: `<h1>${html(title)}</h1>\n<p>${desc}</p>\n`,
	});
}

function htmlBreadcrumbs(path = '') {
	const slash = '<span class="bc-sep">/</span>';
	return path
		.split('/')
		.filter(Boolean)
		.map((part, index, parts) => {
			const distance = parts.length - index - 1;
			if (distance <= 0) {
				return `<span class="bc-current filepath">${html(part)}</span>`;
			}
			const href = Array(distance).fill('..').join('/');
			return `<a class="bc-link filepath" href="${attr(href)}">${html(part)}</a>`;
		})
		.join(slash);
}

/**
 * @param {{ root: string; dirPath: string, items: {filePath: string; kind: FSEntryKind}[], ext?: string[] }} data
 * @returns {Promise<string>}
 */
export function dirListPage({ root, dirPath, items, ext = [] }) {
	const rootName = basename(root);
	const dirRelPath = relative(root, dirPath);
	const dirDisplayPath = [rootName, dirRelPath].filter(Boolean).join('/');

	const dirs = items.filter((x) => x.kind === 'dir');
	const files = items.filter((x) => x.kind !== 'dir');

	if (dirRelPath) {
		dirs.unshift({ filePath: dirPath + '/..', kind: 'dir' });
	}

	// Make sure we have at least 2 items to put in each CSS column
	const maxCols = clamp(Math.ceil((dirs.length + files.length) / 3), 1, 4);

	return htmlTemplate({
		title: `Index of ${dirDisplayPath}`,
		base: `/${dirRelPath}/`.replace(/\/{2,}/g, '/'),
		body: `
<h1>
	Index of <span class="bc">${htmlBreadcrumbs(dirDisplayPath)}</span>
</h1>
<ul class="files" style="--max-col-count:${maxCols}">
${dirs.map((item) => dirListItem(item, { ext })).join('\n')}
${files.map((item) => dirListItem(item, { ext })).join('\n')}
</ul>
`.trim(),
	});
}

/** @type {(item: {filePath: string; kind: FSEntryKind}, options: { ext: string[] }) => string} */
function dirListItem({ filePath, kind }, { ext }) {
	const isParent = kind === 'dir' && filePath.endsWith('..');
	const iconId = `icon-${kind ?? 'file'}`;
	const className = `files-item files-item--${kind ?? 'file'}${isParent ? ' files-item--parent' : ''}`;

	const name = basename(filePath);
	const nameSuffix = kind === 'dir' ? '/' : '';
	const label = isParent ? 'Parent directory' : '';

	// clean url: remove extension if possible
	let href = encodeURIComponent(name);
	if (kind === 'file') {
		const match = ext.find((e) => filePath.endsWith(e));
		if (match) href = href.slice(0, href.length - match.length);
	}

	const parts = [
		`<li class="${attr(className)}">\n`,
		`<a class="files-link" href="${attr(href)}"${label && ` aria-label="${attr(label)}" title="${attr(label)}"`}>`,
		`<svg class="files-icon" width="20" height="20"><use xlink:href="#${attr(iconId)}"></use></svg>`,
		`<span class="files-name filepath">${html(name)}${nameSuffix && `<span>${html(nameSuffix)}</span>`}</span>`,
		`</a>`,
		`\n</li>`,
	];

	return parts.join('');
}
