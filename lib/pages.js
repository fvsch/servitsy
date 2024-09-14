import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { clamp, escapeHtml, fwdSlash, getDirname, trimSlash } from './utils.js';

/**
@typedef {import('./types.js').DirIndexItem} DirIndexItem
@typedef {import('./types.js').ServerOptions} ServerOptions
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
		const contents = await readFile(fullPath, { encoding: 'utf8' });
		assetCache.set(fullPath, contents);
		return contents;
	}
}

/**
 * @param {{ base?: string; body: string; icon?: 'list' | 'error'; title?: string }} data
 * @returns {Promise<string>}
 */
async function htmlTemplate({ base, body, icon, title }) {
	const [css, svgSprite, svgIcon] = await Promise.all([
		readAsset('assets/styles.css'),
		readAsset('assets/icons.svg'),
		icon === 'list' || icon === 'error' ? readAsset(`assets/favicon-${icon}.svg`) : undefined,
	]);

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
${title ? `<title>${html(title)}</title>` : ''}
${base ? `<base href="${attr(base)}">` : ''}
<meta name="viewport" content="width=device-width">
${svgIcon ? `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${btoa(svgIcon)}">` : ''}
<style>${css.toString()}</style>
</head>
<body>
${svgSprite.toString()}
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
	const displayPath = decodeURIPathSegments(urlPath);

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
		icon: 'error',
		body: `<h1>${html(title)}</h1>\n<p>${desc}</p>\n`,
	});
}

/**
 * @param {{ filePath: string; localPath: string; items: DirIndexItem[] }} data
 * @param {Pick<ServerOptions, 'root' | 'ext'>} options
 * @returns {Promise<string>}
 */
export function dirListPage({ filePath, localPath, items }, options) {
	const rootName = basename(options.root);
	const dirPath = trimSlash(fwdSlash(localPath));
	const baseUrl = dirPath ? `/${dirPath}/` : '/';

	const displayPath = decodeURIPathSegments(dirPath ? `${rootName}/${dirPath}` : rootName);

	const sorted = [...items.filter((x) => isDirLike(x)), ...items.filter((x) => !isDirLike(x))];

	if (dirPath) {
		sorted.unshift({
			filePath: dirname(filePath),
			localPath: dirname(localPath),
			kind: 'dir',
			isParent: true,
		});
	}

	// Make sure we have at least 2 items to put in each CSS column
	const maxCols = clamp(Math.ceil(sorted.length / 3), 1, 4);

	return htmlTemplate({
		title: `Index of ${displayPath}`,
		icon: 'list',
		base: baseUrl,
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
function dirListItem(item, { ext }) {
	const { filePath, isParent = false } = item;
	const isSymlink = item.kind === 'link';
	const displayKind = isDirLike(item) ? 'dir' : 'file';

	const iconId = `icon-${displayKind}${isSymlink ? '-link' : ''}`;
	const className = ['files-item', `files-item--${displayKind}`];
	if (isParent) className.push('files-item--parent');
	if (isSymlink) className.push('files-item--symlink');

	const label = isParent ? 'Parent directory' : '';
	const name = isParent ? '..' : basename(filePath);
	const suffix = displayKind === 'dir' ? '/' : '';

	// clean url: remove extension if possible
	let href = encodeURIComponent(name);
	if (displayKind === 'file') {
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

function decodeURIPathSegment(s = '') {
	return decodeURIComponent(s).replaceAll('\\', '\\\\').replaceAll('/', '\\/');
}

function decodeURIPathSegments(path = '') {
	return path.split('/').map(decodeURIPathSegment).join('/');
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
 * @param {DirIndexItem} item
 * @returns {boolean}
 */
function isDirLike(item) {
	return item.kind === 'dir' || (item.kind === 'link' && item.target?.kind === 'dir');
}
