import { isAbsolute, join } from 'node:path';

import { getIndex, getKind, getLocalPath, getRealpath, isReadable, isSubpath } from './fs-utils.js';
import { PathMatcher } from './path-matcher.js';
import { fwdSlash, trimSlash } from './utils.js';

/**
@typedef {import('./types.d.ts').DirIndexItem} DirIndexItem
@typedef {import('./types.d.ts').FSEntryBase} FSEntryBase
@typedef {import('./types.d.ts').ResolveResult} ResolveResult
@typedef {import('./types.d.ts').ServerOptions} ServerOptions
*/

export class FileResolver {
	/** @type {string} */
	#root;

	/** @type {string[]} */
	#ext = [];

	/** @type {string[]} */
	#dirFile = [];

	/** @type {boolean} */
	#dirList = false;

	/** @type {PathMatcher} */
	#excludeMatcher;

	/** @param {{root: string } & Partial<ServerOptions>} options */
	constructor(options) {
		if (typeof options.root !== 'string') {
			throw new Error('Missing root directory');
		} else if (!isAbsolute(options.root)) {
			throw new Error('Expected absolute root path');
		}
		this.#root = trimSlash(options.root, { end: true });
		if (Array.isArray(options.ext)) this.#ext = options.ext;
		if (Array.isArray(options.dirFile)) this.#dirFile = options.dirFile;
		if (typeof options.dirList === 'boolean') this.#dirList = options.dirList;
		this.#excludeMatcher = new PathMatcher(options.exclude ?? [], { caseSensitive: true });
	}

	/** @type {(url: string) => Promise<ResolveResult>} */
	async find(url) {
		const { urlPath, filePath: targetPath } = resolveUrlPath(this.#root, url);

		/** @type {ResolveResult} */
		const result = {
			urlPath,
			status: 404,
			filePath: null,
			kind: null,
		};

		if (targetPath == null) {
			return result;
		}

		// Locate file (following symlinks)
		let file = await this.locateFile(targetPath);
		if (file.kind === 'link') {
			const realPath = await getRealpath(file.filePath);
			const real = realPath != null ? await this.locateFile(realPath) : null;
			if (real?.kind === 'file' || real?.kind === 'dir') {
				file = real;
			}
		}

		// We have a match
		if (file.kind === 'file' || file.kind === 'dir') {
			Object.assign(result, file);
		}

		// Check permissions (directories are always a 404 if dirList is false)
		if (file.kind === 'file' || (file.kind === 'dir' && this.#dirList)) {
			const allowed = this.allowedPath(file.filePath);
			const readable = allowed && (await isReadable(file.filePath, file.kind));
			result.status = allowed ? (readable ? 200 : 403) : 404;
		}

		return result;
	}

	/** @type {(dirPath: string) => Promise<DirIndexItem[]>} */
	async index(dirPath) {
		if (!this.#dirList) return [];

		/** @type {DirIndexItem[]} */
		const items = (await getIndex(dirPath)).filter(
			(item) => item.kind != null && this.allowedPath(item.filePath),
		);

		items.sort((a, b) => a.filePath.localeCompare(b.filePath));

		return Promise.all(
			items.map(async (item) => {
				// resolve symlinks
				if (item.kind === 'link') {
					const filePath = await getRealpath(item.filePath);
					if (filePath != null && this.withinRoot(filePath)) {
						const kind = await getKind(filePath);
						item.target = { filePath, kind };
					}
				}
				return item;
			}),
		);
	}

	/**
	@type {(filePath: string[]) => Promise<FSEntryBase | void>}
	*/
	async locateAltFiles(filePaths) {
		for (const filePath of filePaths) {
			if (!this.withinRoot(filePath)) continue;
			const kind = await getKind(filePath);
			if (kind === 'file' || kind === 'link') {
				return { filePath, kind };
			}
		}
	}

	/**
	Locate a file or alternative files that can be served for a resource,
	using the config for extensions and index file lookup.
	@type {(filePath: string) => Promise<FSEntryBase>}
	*/
	async locateFile(filePath) {
		if (!this.withinRoot(filePath)) {
			return { filePath, kind: null };
		}

		const kind = await getKind(filePath);

		// Try alternates
		if (kind === 'dir' && this.#dirFile.length) {
			const paths = this.#dirFile.map((name) => join(filePath, name));
			const match = await this.locateAltFiles(paths);
			if (match) return match;
		} else if (kind === null && this.#ext.length) {
			const paths = this.#ext.map((ext) => filePath + ext);
			const match = await this.locateAltFiles(paths);
			if (match) return match;
		}

		return { filePath, kind };
	}

	/** @type {(filePath: string) => boolean} */
	allowedPath(filePath) {
		const localPath = getLocalPath(this.#root, filePath);
		if (localPath == null) return false;
		return this.#excludeMatcher.test(localPath) === false;
	}

	/** @type {(urlPath: string | null) => string | null} */
	urlToTargetPath(urlPath) {
		if (urlPath && urlPath.startsWith('/')) {
			const filePath = join(this.#root, decodeURIComponent(urlPath));
			return trimSlash(filePath, { end: true });
		}
		return null;
	}

	/** @type {(filePath: string) => boolean} */
	withinRoot(filePath) {
		return isSubpath(this.#root, filePath);
	}
}

/** @type {(urlPath: string) => boolean} */
export function isValidUrlPath(urlPath) {
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

/** @type {(root: url, url: string) => {urlPath: string; filePath: string | null}} */
export function resolveUrlPath(root, url) {
	try {
		const urlPath = fwdSlash(new URL(url, 'http://localhost/').pathname) ?? '/';
		const filePath = isValidUrlPath(urlPath)
			? trimSlash(join(root, decodeURIComponent(urlPath)), { end: true })
			: null;
		return { urlPath, filePath };
	} catch {}
	return { urlPath: url, filePath: null };
}
