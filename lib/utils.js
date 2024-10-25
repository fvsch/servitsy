import { env, versions } from 'node:process';

/**
@typedef {import('./types.d.ts').ErrorList} ErrorList
*/

/** @type {(value: number, min: number, max: number) => number} */
export function clamp(value, min, max) {
	if (typeof value !== 'number') value = min;
	return Math.min(max, Math.max(min, value));
}

/** @type {(input: string, context?: 'text' | 'attr') => string} */
export function escapeHtml(input, context = 'text') {
	if (typeof input !== 'string') return '';
	let result = input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
	if (context === 'attr') result = result.replaceAll(`"`, '&quot;').replaceAll(`'`, '&apos;');
	return result;
}

/** @type {() => ErrorList} */
export function errorList() {
	/** @type {string[]} */
	const list = [];
	const fn = (msg = '') => list.push(msg);
	fn.list = list;
	return fn;
}

/** @type {(input: string) => string} */
export function fwdSlash(input = '') {
	return input.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

/** @type {(key: string) => string} */
export function getEnv(key) {
	return env[key] ?? '';
}

/** @type {() => 'bun' | 'deno' | 'node' | 'webcontainer'} */
export const getRuntime = once(() => {
	if (versions.bun && globalThis.Bun) return 'bun';
	if (versions.deno && globalThis.Deno) return 'deno';
	if (versions.webcontainer && getEnv('SHELL').endsWith('/jsh')) return 'webcontainer';
	return 'node';
});

/** @type {(name: string) => string} */
export function headerCase(name) {
	return name.replace(/((^|\b|_)[a-z])/g, (s) => s.toUpperCase());
}

/** @type {(address: string) => boolean} */
export function isPrivateIPv4(address = '') {
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

/** @type {(start: number, end: number, limit?: number) => number[]} */
export function intRange(start, end, limit = 1_000) {
	for (const [key, val] of Object.entries({ start, end, limit })) {
		if (!Number.isSafeInteger(val)) throw new Error(`Invalid ${key} param: ${val}`);
	}
	const length = Math.min(Math.abs(end - start) + 1, Math.abs(limit));
	const increment = start < end ? 1 : -1;
	return Array(length)
		.fill(undefined)
		.map((_, i) => start + i * increment);
}

/**
Cache a function's result after the first call
@type {<Result>(fn: () => Result) => () => Result}
*/
export function once(fn) {
	/** @type {ReturnType<fn>} */
	let value;
	return () => {
		if (typeof value === 'undefined') value = fn();
		return value;
	};
}

/**
@type {(input: string, options?: { start?: boolean; end?: boolean }) => string}
*/
export function trimSlash(input = '', { start, end } = { start: true, end: true }) {
	if (start === true) input = input.replace(/^[\/\\]/, '');
	if (end === true) input = input.replace(/[\/\\]$/, '');
	return input;
}

export function withResolvers() {
	/** @type {{ resolve: (value?: any) => void; reject: (reason?: any) => void }} */
	let resolvers = { resolve: () => {}, reject: () => {} };
	const promise = new Promise((resolve, reject) => {
		resolvers = { resolve, reject };
	});
	return { promise, ...resolvers };
}
