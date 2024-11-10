import { isAbsolute, join } from 'node:path';

import { getIndex, getKind, getLocalPath, getRealpath, isReadable, isSubpath } from './fs-utils.js';
import { PathMatcher } from './path-matcher.js';
import { trimSlash } from './utils.js';

/**
@typedef {import('./types.d.ts').FSLocation} FSLocation
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

	/** @param {string} relativePath */
	async find(relativePath) {
		const result = {
			status: 404,
			/** @type {FSLocation | null} */
			file: null,
		};

		const targetPath = this.resolvePath(relativePath);
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
			result.file = file;
			const allowed =
				file.kind === 'dir' && !this.#dirList ? false : this.allowedPath(file.filePath);
			const readable = allowed && (await isReadable(file.filePath, file.kind));
			result.status = allowed ? (readable ? 200 : 403) : 404;
		}

		return result;
	}

	/** @type {(dirPath: string) => Promise<FSLocation[]>} */
	async index(dirPath) {
		if (!this.#dirList) return [];

		/** @type {FSLocation[]} */
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
	@type {(filePath: string[]) => Promise<FSLocation | void>}
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
	@type {(filePath: string) => Promise<FSLocation>}
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

	/** @type {(relativePath: string) => string | null} */
	resolvePath(relativePath) {
		const filePath = join(this.#root, relativePath);
		return this.withinRoot(filePath) ? trimSlash(filePath, { end: true }) : null;
	}

	/** @type {(filePath: string) => boolean} */
	withinRoot(filePath) {
		return isSubpath(this.#root, filePath);
	}
}
