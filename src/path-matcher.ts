import { fwdSlash } from './utils.js';

export class PathMatcher {
	#positive: Array<string | RegExp> = [];
	#negative: Array<string | RegExp> = [];
	#caseSensitive = true;

	constructor(patterns: string[], options?: { caseSensitive: boolean }) {
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

	test(filePath: string): boolean {
		if (this.#positive.length === 0) {
			return false;
		}
		const segments = fwdSlash(filePath).split('/').filter(Boolean);
		const matched = this.#matchSegments(segments);
		return matched.length > 0;
	}

	#parse(input: string): string | RegExp | null {
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

	#matchPattern(pattern: string | RegExp, value: string): boolean {
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

	#matchSegments(segments: string[]): string[] {
		return segments.filter((segment) => {
			const positive = this.#positive.some((pattern) => this.#matchPattern(pattern, segment));
			if (!positive) return false;
			const negative = this.#negative.some((pattern) => this.#matchPattern(pattern, segment));
			return positive && !negative;
		});
	}

	data() {
		return structuredClone({
			positive: this.#positive,
			negative: this.#negative,
		});
	}
}
