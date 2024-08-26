import { join, relative, sep as dirSep } from 'node:path';

import { fwdPath } from './utils.js';

/**
@typedef {import('./types.js').FSEntryKind} FSEntryKind
@typedef {import('./types.js').FSEntryBase} FSEntryBase
@typedef {import('./types.js').FSUtils} FSUtils
@typedef {import('./types.js').ResolveOptions} ResolveOptions

@typedef {{
	status: number;
	urlPath: string;
	filePath: string | null;
	kind: FSEntryKind;
}} ResolveResult
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

	/** @type {FSUtils} */
	#fsUtils;

	/**
	 * @param {{root: string } & Partial<ResolveOptions>} options
	 * @param {FSUtils} fsUtils
	 */
	constructor({ root, ext, dirFile, dirList, exclude }, fsUtils) {
		if (typeof root !== 'string') {
			throw new Error('Missing root directory');
		}
		this.#root = root.replace(/[\\\/]+$/, '');
		if (Array.isArray(ext)) this.#ext = ext;
		if (Array.isArray(dirFile)) this.#dirFile = dirFile;
		if (typeof dirList === 'boolean') this.#dirList = dirList;
		this.#excludeMatcher = new PathMatcher(exclude ?? [], { caseSensitive: true });
		this.#fsUtils = fsUtils;
	}

	/**
	 * @param {string} urlPath
	 * @returns {Promise<ResolveResult>}
	 */
	async find(urlPath) {
		let status = 404;
		/** @type {FSEntryKind} */
		let kind = null;
		/** @type {string | null} */
		let filePath = null;

		const targetPath = this.urlToTargetPath(urlPath);

		if (this.withinRoot(targetPath)) {
			const resource = await this.locateFile(targetPath);
			if (resource.kind && resource.filePath) {
				kind = resource.kind;
				filePath = resource.filePath;
				if (this.allowedPath(resource.filePath)) {
					const readable = await this.#fsUtils.readable(resource.filePath, resource.kind);
					status = readable ? 200 : 403;
				}
			}
		}

		return { urlPath, status, filePath, kind };
	}

	/**
	 * Locate alternative files that can be served for a resource,
	 * using the config for extensions and index file lookup.
	 * @param {string} targetPath
	 * @returns {Promise<FSEntryBase>}
	 */
	async locateFile(targetPath) {
		const targetKind = await this.#fsUtils.kind(targetPath);

		if (targetKind === 'file') {
			return { kind: targetKind, filePath: targetPath };
		} else if (targetKind === 'dir') {
			const candidates = this.#dirFile.map((name) => join(targetPath, name));
			for (const file of candidates) {
				const kind = await this.#fsUtils.kind(file);
				if (kind === 'file') return { kind, filePath: file };
			}
			return { kind: targetKind, filePath: targetPath };
		} else {
			const candidates = this.#ext.map((ext) => targetPath + ext);
			for (const file of candidates) {
				const kind = await this.#fsUtils.kind(file);
				if (kind === 'file') return { kind, filePath: file };
			}
			return { kind: null, filePath: targetPath };
		}
	}

	/**
	 * @param {string} resourcePath
	 * @returns {boolean}
	 */
	allowedPath(resourcePath) {
		if (!this.withinRoot(resourcePath)) {
			return false;
		}
		const subPath = relative(this.#root, resourcePath);
		return this.#excludeMatcher.test(subPath) === false;
	}

	/**
	 * @param {string} dirPath
	 * @returns {Promise<FSEntryBase[]>}
	 */
	async index(dirPath) {
		if (!this.#dirList) return [];
		const entries = (await this.#fsUtils.index(dirPath)).filter((entry) =>
			this.allowedPath(entry.filePath),
		);
		entries.sort((a, b) => a.filePath.localeCompare(b.filePath));
		return entries;
	}

	/**
	 * @param {string} urlPath
	 * @returns {string}
	 */
	urlToTargetPath(urlPath) {
		const { pathname } = new URL(urlPath, 'http://localhost/');

		const cleanUrlPath = decodeURIComponent(pathname)
			.replace(/\\/g, '/')
			.replace(/\.+\//g, '/')
			.replace(/\/{2,}/g, '/');

		return join(this.#root, cleanUrlPath.replace(/\/$/, ''));
	}

	/**
	 * @param {string} resourcePath
	 * @returns {boolean}
	 */
	withinRoot(resourcePath) {
		if (resourcePath.includes('..')) return false;
		return resourcePath === this.#root || resourcePath.startsWith(this.#root + dirSep);
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
		const segments = fwdPath(filePath).split('/').filter(Boolean);
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
