import { join, sep as dirSep } from 'node:path';

import { getIndex, getKind, getRealpath, isReadable } from './fs-utils.js';
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
		}
		this.#root = trimSlash(options.root, { end: true });
		if (Array.isArray(options.ext)) this.#ext = options.ext;
		if (Array.isArray(options.dirFile)) this.#dirFile = options.dirFile;
		if (typeof options.dirList === 'boolean') this.#dirList = options.dirList;
		this.#excludeMatcher = new PathMatcher(options.exclude ?? [], { caseSensitive: true });
	}

	/** @type {(url: string) => Promise<ResolveResult>} */
	async find(url) {
		const urlPath = this.cleanUrlPath(url);

		/** @type {ResolveResult} */
		const result = {
			urlPath: urlPath ?? url,
			status: 404,
			file: null,
		};

		const targetPath = this.urlToTargetPath(urlPath);

		if (!urlPath || !targetPath || !this.withinRoot(targetPath)) {
			return result;
		}

		let resource = await this.locateFile(targetPath);
		const isSymlink = resource.kind === 'link';

		if (isSymlink) {
			const filePath = await getRealpath(resource.filePath);
			const kind = filePath ? await getKind(filePath) : null;
			if (filePath) {
				resource = { filePath, kind };
			}
		}

		if (resource.kind === 'dir' || resource.kind === 'file') {
			const localPath = this.localPath(resource.filePath);

			result.file = {
				filePath: resource.filePath,
				localPath: this.localPath(resource.filePath),
				kind: resource.kind,
			};

			const enabled = resource.kind === 'file' || (resource.kind === 'dir' && this.#dirList);

			if (enabled && this.allowedLocalPath(localPath)) {
				const readable = await isReadable(resource.filePath, resource.kind);
				result.status = readable ? 200 : 403;
			} else if (isSymlink) {
				result.status = 403;
			}
		}

		return result;
	}

	/** @type {(dirPath: string) => Promise<DirIndexItem[]>} */
	async index(dirPath) {
		if (!this.#dirList) return [];

		/** @type {DirIndexItem[]} */
		const items = [];

		for (const { kind, filePath } of await getIndex(dirPath)) {
			const localPath = this.localPath(filePath);
			if (kind != null && this.allowedLocalPath(localPath)) {
				items.push({ filePath, localPath, kind });
			}
		}

		items.sort((a, b) => a.filePath.localeCompare(b.filePath));

		return Promise.all(
			items.map(async (item) => {
				// resolve symlinks
				if (item.kind === 'link') {
					const filePath = await getRealpath(item.filePath);
					const kind = filePath ? await getKind(filePath) : null;
					if (filePath != null && kind != null) {
						item.target = {
							kind,
							filePath,
							localPath: this.localPath(filePath),
						};
					}
				}
				return item;
			}),
		);
	}

	/**
	Locate alternative files that can be served for a resource,
	using the config for extensions and index file lookup.
	@type {(fullPath: string) => Promise<FSEntryBase>}
	*/
	async locateFile(fullPath) {
		const targetKind = await getKind(fullPath);

		if (targetKind === 'file' || targetKind === 'link') {
			return { kind: targetKind, filePath: fullPath };
		}

		/** @type {string[]} */
		let candidates = [];
		if (targetKind === 'dir' && this.#dirFile.length) {
			candidates = this.#dirFile.map((name) => join(fullPath, name));
		} else if (targetKind === null && this.#ext.length) {
			candidates = this.#ext.map((ext) => fullPath + ext);
		}

		for (const filePath of candidates) {
			const kind = await getKind(filePath);
			if (kind === 'file' || kind === 'link') {
				return { kind, filePath };
			}
		}

		return { kind: targetKind, filePath: fullPath };
	}

	/** @type {(localPath: string | null) => boolean} */
	allowedLocalPath(localPath) {
		if (typeof localPath === 'string') {
			return this.#excludeMatcher.test(localPath) === false;
		}
		return false;
	}

	/** @type {(urlPath: string) => boolean} */
	allowedUrlPath(urlPath) {
		const forbidden = ['/', '\\', '..'];
		const segments = urlPath
			.split('/')
			.filter(Boolean)
			.map((s) => decodeURIComponent(s));
		return segments.every((s) => forbidden.every((f) => !s.includes(f)));
	}

	/** @type {(url: string) => string | null} */
	cleanUrlPath(url) {
		try {
			const path = fwdSlash(new URL(url, 'http://localhost/').pathname);
			if (this.allowedUrlPath(path)) {
				return path.startsWith('/') ? path : `/${path}`;
			}
		} catch {}
		return null;
	}

	/** @type {(fullPath: string) => string | null} */
	localPath(fullPath) {
		if (this.withinRoot(fullPath)) {
			return fullPath.slice(this.#root.length + 1);
		}
		return null;
	}

	/** @type {(urlPath: string | null) => string | null} */
	urlToTargetPath(urlPath) {
		if (urlPath && urlPath.startsWith('/')) {
			const filePath = join(this.#root, decodeURIComponent(urlPath));
			return trimSlash(filePath, { end: true });
		}
		return null;
	}

	/** @type {(fullPath: string) => boolean} */
	withinRoot(fullPath) {
		if (fullPath.includes('..')) return false;
		const prefix = this.#root + dirSep;
		return fullPath === this.#root || fullPath.startsWith(prefix);
	}
}
