import { join, relative, sep as dirSep } from 'node:path';

import { fwdPath } from './utils.js';

/**
@typedef {'dir' | 'file' | null} FSKind

@typedef {{
	kind: (filePath: string) => Promise<FSKind>;
	readable: (filePath: string, kind?: FSKind) => Promise<boolean>;
	info: (filePath: string) => Promise<{filePath: string; readable: boolean; kind: FSKind}>;
	index: (dirPath: string) => Promise<{filePath: string; kind: FSKind}[]>;
}} FSUtils

@typedef {{
	ext: string[];
	dirFile: string[];
	dirList: boolean,
	exclude: string[];
}} ResolveOptions

@typedef {{
	status: number;
	urlPath: string;
	filePath: string | null;
	kind: FSKind;
}} ResolveResult

@typedef {{ caseSensitive: boolean }} PathMatcherOptions
**/

export class FileResolver {
	/** @type {string} */
	#root;

	/** @type {Pick<ResolveOptions, 'ext' | 'dirFile' | 'dirList'>} */
	#options;

	/** @type {PathMatcher} */
	#excludeMatcher;

	/** @type {FSUtils} */
	#fsUtils;

	/**
	 * @param {string} root
	 * @param {FSUtils} fsUtils
	 * @param {Partial<ResolveOptions>} options
	 */
	constructor(root, fsUtils, { ext = [], dirFile = [], dirList = false, exclude = [] }) {
		if (typeof root !== 'string') {
			throw new Error('Missing root directory');
		}
		this.#root = root.replace(/[\\\/]+$/, '');
		this.#fsUtils = fsUtils;
		this.#options = structuredClone({ ext, dirFile, dirList });
		this.#excludeMatcher = new PathMatcher(exclude, { caseSensitive: true });
	}

	/**
	 * @param {string} urlPath
	 * @returns {Promise<{status: number; urlPath: string; filePath: string | null; kind: FSKind}>}
	 */
	async find(urlPath) {
		let status = 404;
		/** @type {FSKind} */
		let kind = null;
		/** @type {string | null} */
		let filePath = null;

		const targetPath = this.urlToTargetPath(urlPath);

		if (this.withinRoot(targetPath)) {
			const resource = await this.locateFile(targetPath);
			if (resource.kind && resource.path) {
				kind = resource.kind;
				filePath = resource.path;
				if (this.allowedPath(resource.path)) {
					const readable = await this.#fsUtils.readable(resource.path, resource.kind);
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
	 * @returns {Promise<{kind: 'dir' | 'file' | null; path: string}>}
	 */
	async locateFile(targetPath) {
		const targetKind = await this.#fsUtils.kind(targetPath);

		if (targetKind === 'file') {
			return { kind: targetKind, path: targetPath };
		} else if (targetKind === 'dir') {
			const candidates = this.#options.dirFile.map((name) => join(targetPath, name));
			for (const file of candidates) {
				const kind = await this.#fsUtils.kind(file);
				if (kind === 'file') return { kind, path: file };
			}
			return { kind: targetKind, path: targetPath };
		} else {
			const candidates = this.#options.ext.map((ext) => targetPath + ext);
			for (const file of candidates) {
				const kind = await this.#fsUtils.kind(file);
				if (kind === 'file') return { kind, path: file };
			}
			return { kind: null, path: targetPath };
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
	 * @returns {Promise<{ filePath: string; kind: FSKind }[]>}
	 */
	async index(dirPath) {
		if (!this.#options.dirList) return [];
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
	constructor(patterns = [], { caseSensitive } = {}) {
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
