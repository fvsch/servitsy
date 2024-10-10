import { fsProxy as nodeFsProxy } from './fs-proxy.js';
import { fwdSlash, trimSlash } from './utils.js';

/**
@typedef {import('./types.js').DirIndexItem} DirIndexItem
@typedef {import('./types.js').FSEntryBase} FSEntryBase
@typedef {import('./types.js').FSEntryKind} FSEntryKind
@typedef {import('./types.js').FSProxy} FSProxy
@typedef {import('./types.js').ResolveResult} ResolveResult
@typedef {import('./types.js').ServerOptions} ServerOptions
**/

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

	/** @type {FSProxy} */
	#fs;

	/**
	 * @param {{root: string } & Partial<ServerOptions>} options
	 * @param {FSProxy} [fsProxy]
	 */
	constructor({ root, ext, dirFile, dirList, exclude }, fsProxy) {
		if (typeof root !== 'string') {
			throw new Error('Missing root directory');
		}
		this.#root = trimSlash(root, { end: true });
		if (Array.isArray(ext)) this.#ext = ext;
		if (Array.isArray(dirFile)) this.#dirFile = dirFile;
		if (typeof dirList === 'boolean') this.#dirList = dirList;
		this.#excludeMatcher = new PathMatcher(exclude ?? [], { caseSensitive: true });
		this.#fs = fsProxy ?? nodeFsProxy;
	}

	/**
	 * @param {string} filePath
	 */
	async open(filePath) {
		return this.#fs.open(filePath);
	}

	/**
	 * @param {string} filePath
	 */
	async read(filePath) {
		return this.#fs.readFile(filePath);
	}

	/**
	 * @param {string} filePath
	 */
	readStream(filePath) {
		return this.#fs.readStream(filePath);
	}

	/**
	 * @param {string} url
	 * @returns {Promise<ResolveResult>}
	 */
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
			const filePath = await this.#fs.realpath(resource.filePath);
			const kind = filePath ? await this.#fs.kind(filePath) : null;
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

			if (enabled && this.allowedPath(localPath)) {
				const readable = await this.#fs.readable(resource.filePath, resource.kind);
				result.status = readable ? 200 : 403;
			} else if (isSymlink) {
				result.status = 403;
			}
		}

		return result;
	}

	/**
	 * Locate alternative files that can be served for a resource,
	 * using the config for extensions and index file lookup.
	 * @param {string} targetPath
	 * @returns {Promise<FSEntryBase>}
	 */
	async locateFile(targetPath) {
		const targetKind = await this.#fs.kind(targetPath);

		if (targetKind === 'file' || targetKind === 'link') {
			return { kind: targetKind, filePath: targetPath };
		}

		/** @type {string[]} */
		let candidates = [];
		if (targetKind === 'dir' && this.#dirFile.length) {
			candidates = this.#dirFile.map((name) => this.#fs.join(targetPath, name));
		} else if (targetKind === null && this.#ext.length) {
			candidates = this.#ext.map((ext) => targetPath + ext);
		}

		for (const filePath of candidates) {
			const kind = await this.#fs.kind(filePath);
			if (kind === 'file' || kind === 'link') {
				return { kind, filePath };
			}
		}

		return { kind: targetKind, filePath: targetPath };
	}

	/**
	 * @param {string | null} localPath
	 * @returns {boolean}
	 */
	allowedPath(localPath) {
		if (typeof localPath === 'string') {
			return this.#excludeMatcher.test(localPath) === false;
		}
		return false;
	}

	/**
	 * @param {string} filePath
	 * @returns {string | null}
	 */
	localPath(filePath) {
		if (this.withinRoot(filePath)) {
			return filePath.slice(this.#root.length + 1);
		}
		return null;
	}

	/**
	 * @param {string} dirPath
	 * @returns {Promise<DirIndexItem[]>}
	 */
	async index(dirPath) {
		if (!this.#dirList) return [];

		/** @type {DirIndexItem[]} */
		const items = [];

		for (const { kind, filePath } of await this.#fs.index(dirPath)) {
			const localPath = this.localPath(filePath);
			if (kind != null && this.allowedPath(localPath)) {
				items.push({ filePath, localPath, kind });
			}
		}

		items.sort((a, b) => a.filePath.localeCompare(b.filePath));

		return Promise.all(
			items.map(async (item) => {
				// resolve symlinks
				if (item.kind === 'link') {
					const filePath = await this.#fs.realpath(item.filePath);
					const kind = filePath ? await this.#fs.kind(filePath) : null;
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
	 * @param {string} url
	 * @returns {string | null}
	 */
	cleanUrlPath(url) {
		try {
			const path = fwdSlash(new URL(url, 'http://localhost/').pathname);
			if (this.validateUrlPath(path)) {
				return path.startsWith('/') ? path : `/${path}`;
			}
		} catch {}
		return null;
	}

	/**
	 * @param {string | null} urlPath
	 * @returns {string | null}
	 */
	urlToTargetPath(urlPath) {
		if (urlPath && urlPath.startsWith('/')) {
			const filePath = this.#fs.join(this.#root, decodeURIComponent(urlPath));
			return trimSlash(filePath, { end: true });
		}
		return null;
	}

	/**
	 * @param {string} urlPath
	 */
	validateUrlPath(urlPath) {
		const forbidden = ['/', '\\', '..'];
		const segments = urlPath
			.split('/')
			.filter(Boolean)
			.map((s) => decodeURIComponent(s));
		return segments.every((s) => forbidden.every((f) => !s.includes(f)));
	}

	/**
	 * @param {string} filePath
	 * @returns {boolean}
	 */
	withinRoot(filePath) {
		if (filePath.includes('..')) return false;
		const prefix = this.#root + this.#fs.dirSep;
		return filePath === this.#root || filePath.startsWith(prefix);
	}
}

/**
 * @typedef {{ caseSensitive: boolean }} PathMatcherOptions
 */
export class PathMatcher {
	/** @type {Array<string | RegExp>} */
	#positive = [];

	/** @type {Array<string | RegExp>} */
	#negative = [];

	/** @type {PathMatcherOptions} */
	#options = {
		caseSensitive: true,
	};

	/**
	 * @param {string[]} patterns
	 * @param {Partial<PathMatcherOptions>} [options]
	 */
	constructor(patterns, { caseSensitive } = {}) {
		if (typeof caseSensitive === 'boolean') {
			this.#options.caseSensitive = caseSensitive;
		}
		for (const input of patterns) {
			if (typeof input !== 'string') continue;
			const isNegative = input.startsWith('!');
			const trimmedInput = input.slice(isNegative ? 1 : 0);
			const pattern = trimmedInput.length > 0 ? this.#parse(trimmedInput) : null;
			if (pattern != null) {
				(isNegative ? this.#negative : this.#positive).push(pattern);
			}
		}
	}

	/**
	 * @param {string} filePath
	 * @returns {boolean}
	 */
	test(filePath) {
		if (this.#positive.length === 0) {
			return false;
		}
		const segments = fwdSlash(filePath).split('/').filter(Boolean);
		const matched = this.#matchSegments(segments);
		return matched.length > 0;
	}

	get rules() {
		return structuredClone({ positive: this.#positive, negative: this.#negative });
	}

	/**
	 * @param {string} input
	 * @returns {string | RegExp | null}
	 */
	#parse(input) {
		if (this.#options.caseSensitive === false) {
			input = input.toLowerCase();
		}
		if (input.includes('/') || input.includes('\\')) {
			return null;
		} else if (input.includes('*')) {
			const toEscape = /([\[\]\(\)\|\^\$\.\+\?])/g;
			const re = input.replace(toEscape, '\\$1').replace(/\*/g, '[^/]*');
			return new RegExp(re);
		}
		return input;
	}

	/**
	 * @param {string | RegExp} pattern
	 * @param {string} value
	 * @returns {boolean}
	 */
	#matchPattern(pattern, value) {
		if (this.#options.caseSensitive === false) {
			value = value.toLowerCase();
		}
		if (typeof pattern === 'string') {
			return pattern === value;
		} else if (pattern.test(value)) {
			const matches = value.match(pattern);
			return matches != null && matches[0] === value;
		}
		return false;
	}

	/**
	 * @param {string[]} segments
	 * @returns {string[]}
	 */
	#matchSegments(segments) {
		return segments.filter((segment) => {
			const positive = this.#positive.some((pattern) => this.#matchPattern(pattern, segment));
			if (!positive) return false;
			const negative = this.#negative.some((pattern) => this.#matchPattern(pattern, segment));
			return positive && !negative;
		});
	}
}
