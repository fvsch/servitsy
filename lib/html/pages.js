import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { clamp, escapeHtml, getDirname, trimSlash } from '../utils.js';

/**
@typedef {import('../types.js').DirIndexItem} DirIndexItem
@typedef {import('../types.js').ServerOptions} ServerOptions
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
	const displayPath = decodeURIPathComponents(urlPath);

	let title = 'Error';
	let desc = 'Something went wrong';
	if (status === 403) {
		title = '403: Forbidden';
		desc = `Could not access <code class="filepath">${html(displayPath)}</code>`;
	} else if (status === 404) {
		title = '404: Not found';
		desc = `Could not find <code class="filepath">${html(displayPath)}</code>`;
	} else if (status === 500) {
		title = '500: Error';
		desc = `Could not serve <code class="filepath">${html(displayPath)}</code>`;
	}

	return htmlTemplate({
		title,
		body: `<h1>${html(title)}</h1>\n<p>${desc}</p>\n`,
	});
}

function decodeURIPathComponents(path = '') {
	const decode = (s = '') => decodeURIComponent(s).replaceAll('\\', '\\\\').replaceAll('/', '\\/');
	return path.split('/').map(decode).join('/');
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
 * @param {{ dirPath: string; urlPath: string, items: DirIndexItem[] }} data
 * @param {Pick<ServerOptions, 'root' | 'ext'>} options
 * @returns {Promise<string>}
 */
export function dirListPage({ dirPath, urlPath, items }, options) {
	const rootName = basename(options.root);
	const trimmedPath = trimSlash(urlPath);
	const displayPath = decodeURIPathComponents([rootName, trimmedPath].filter(Boolean).join('/'));

	/** @type {(item: DirIndexItem) => boolean} */
	const sortAsDir = (item) =>
		item.kind === 'dir' || (item.kind === 'link' && item.target?.kind === 'dir');

	const sorted = [...items.filter((x) => sortAsDir(x)), ...items.filter((x) => !sortAsDir(x))];
	if (trimmedPath !== '') {
		sorted.unshift({
			filePath: join(dirPath, '..'),
			kind: 'dir',
			isParent: true,
		});
	}

	// Make sure we have at least 2 items to put in each CSS column
	const maxCols = clamp(Math.ceil(sorted.length / 3), 1, 4);

	return htmlTemplate({
		title: `Index of ${displayPath}`,
		base: `/${trimmedPath}/`,
		body: `
<h1>
	Index of <span class="bc">${htmlBreadcrumbs(displayPath)}</span>
</h1>
<ul class="files" style="--max-col-count:${maxCols}">
${sorted.map((item) => dirListItem(item, options)).join('\n')}
</ul>
`.trim(),
	});
}

/**
 * @param {DirIndexItem} item
 * @param {Pick<ServerOptions, 'ext'>} options
 * @returns {string}
 */
function dirListItem({ filePath, kind, isParent = false, target }, { ext }) {
	const isSymlink = kind === 'link';
	const displayKind = (target?.kind ?? kind) === 'dir' ? 'dir' : 'file';

	const iconId = `icon-${displayKind}${isSymlink ? '-link' : ''}`;
	const className = ['files-item', `files-item--${displayKind}`];
	if (isParent) className.push('files-item--parent');
	if (isSymlink) className.push('files-item--symlink');

	const label = isParent ? 'Parent directory' : '';
	const name = isParent ? '..' : basename(filePath);
	const suffix = kind === 'dir' ? '/' : '';

	// clean url: remove extension if possible
	let href = encodeURIComponent(name);
	if (kind === 'file') {
		const match = ext.find((e) => filePath.endsWith(e));
		if (match) href = href.slice(0, href.length - match.length);
	}

	const parts = [
		`<li class="${attr(className.join(' '))}">\n`,
		`<a class="files-link" href="${attr(href)}"${label && ` aria-label="${attr(label)}" title="${attr(label)}"`}>`,
		`<svg class="files-icon" width="20" height="20"><use xlink:href="#${attr(iconId)}"></use></svg>`,
		`<span class="files-name filepath">${html(name)}${suffix && `<span>${html(suffix)}</span>`}</span>`,
		`</a>`,
		`\n</li>`,
	];

	return parts.join('');
}
