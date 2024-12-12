import { env, versions } from 'node:process';
import { isAbsolute, sep as dirSep } from 'node:path';

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
			const toEscape = /([\]|[)(^$.+?])/g;
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

export function clamp(value: number, min: number, max: number): number {
	if (typeof value !== 'number') value = min;
	return Math.min(max, Math.max(min, value));
}

export function escapeHtml(input: string, context: 'text' | 'attr' = 'text'): string {
	if (typeof input !== 'string') return '';
	let result = input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
	if (context === 'attr') result = result.replaceAll(`"`, '&quot;').replaceAll(`'`, '&apos;');
	return result;
}

export function errorList() {
	const list: string[] = [];
	const fn: { (msg: string): void; list: string[] } = (msg = '') => list.push(msg);
	fn.list = list;
	return fn;
}

export function fwdSlash(input: string = ''): string {
	return input.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

export function getEnv(key: string): string {
	return env[key] ?? '';
}

export function getLocalPath(root: string, filePath: string): string | null {
	if (isSubpath(root, filePath)) {
		return trimSlash(filePath.slice(root.length), { start: true, end: true });
	}
	return null;
}

export const getRuntime = once<'bun' | 'deno' | 'node' | 'webcontainer'>(() => {
	if (versions.bun && (globalThis as any).Bun) return 'bun';
	if (versions.deno && (globalThis as any).Deno) return 'deno';
	if (versions.webcontainer && getEnv('SHELL').endsWith('/jsh')) return 'webcontainer';
	return 'node';
});

export function headerCase(name: string): string {
	return name.replace(/((^|\b|_)[a-z])/g, (s) => s.toUpperCase());
}

export function intRange(start: number, end: number, limit: number = 1_000): number[] {
	for (const [key, val] of Object.entries({ start, end, limit })) {
		if (!Number.isSafeInteger(val)) throw new Error(`Invalid ${key} param: ${val}`);
	}
	const length = Math.min(Math.abs(end - start) + 1, Math.abs(limit));
	const increment = start < end ? 1 : -1;
	return Array(length)
		.fill(undefined)
		.map((_, i) => start + i * increment);
}

export function isPrivateIPv4(address?: string) {
	if (!address) return false;
	const bytes = address.split('.').map(Number);
	if (bytes.length !== 4) return false;
	for (const byte of bytes) {
		if (!(byte >= 0 && byte <= 255)) return false;
	}
	return (
		// 10/8
		bytes[0] === 10 ||
		// 172.16/12
		(bytes[0] === 172 && bytes[1] >= 16 && bytes[1] < 32) ||
		// 192.168/16
		(bytes[0] === 192 && bytes[1] === 168)
	);
}

export function isSubpath(parent: string, filePath: string): boolean {
	if (filePath.includes('..') || !isAbsolute(filePath)) return false;
	parent = trimSlash(parent, { end: true });
	return filePath === parent || filePath.startsWith(parent + dirSep);
}

/** Cache a function's result after the first call */
function once<T = any>(fn: () => T): () => T {
	let value: T;
	return () => {
		if (typeof value === 'undefined') value = fn();
		return value;
	};
}

export function printValue(input: any) {
	if (typeof input === 'object') {
		return JSON.stringify(input);
	} else if (typeof input === 'string') {
		return `'${input.replaceAll("'", "\\'")}'`;
	}
	return String(input);
}

export function trimSlash(
	input: string = '',
	config: { start?: boolean; end?: boolean } = { start: true, end: true },
) {
	if (config.start === true) input = input.replace(/^[/\\]/, '');
	if (config.end === true) input = input.replace(/[/\\]$/, '');
	return input;
}

export function withResolvers<T = unknown>() {
	const noop = () => {};
	let resolve: (value: T | PromiseLike<T>) => void = noop;
	let reject: (reason?: any) => void = noop;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
