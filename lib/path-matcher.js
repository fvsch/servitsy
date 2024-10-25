import { fwdSlash } from './utils.js';

export class PathMatcher {
	/** @type {Array<string | RegExp>} */
	#positive = [];

	/** @type {Array<string | RegExp>} */
	#negative = [];

	/** @type {boolean} */
	#caseSensitive = true;

	/**
	@param {string[]} patterns
	@param {Partial<{ caseSensitive: boolean }>} [options]
	*/
	constructor(patterns, options) {
		if (typeof options?.caseSensitive === 'boolean') {
			this.#caseSensitive = options.caseSensitive;
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

	/** @type {(filePath: string) => boolean} */
	test(filePath) {
		if (this.#positive.length === 0) {
			return false;
		}
		const segments = fwdSlash(filePath).split('/').filter(Boolean);
		const matched = this.#matchSegments(segments);
		return matched.length > 0;
	}

	/** @type {(input: string) => string | RegExp | null} */
	#parse(input) {
		if (this.#caseSensitive === false) {
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

	/** @type {(pattern: string | RegExp, value: string) => boolean} */
	#matchPattern(pattern, value) {
		if (this.#caseSensitive === false) {
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

	/** @type {(segments: string[]) => string[]} */
	#matchSegments(segments) {
		return segments.filter((segment) => {
			const positive = this.#positive.some((pattern) => this.#matchPattern(pattern, segment));
			if (!positive) return false;
			const negative = this.#negative.some((pattern) => this.#matchPattern(pattern, segment));
			return positive && !negative;
		});
	}

	data() {
		return { positive: this.#positive, negative: this.#negative };
	}
}
