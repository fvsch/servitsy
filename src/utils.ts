import { env, versions } from 'node:process';

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

export const getRuntime = once<'bun' | 'deno' | 'node' | 'webcontainer'>(() => {
	if (versions.bun && (globalThis as any).Bun) return 'bun';
	if (versions.deno && (globalThis as any).Deno) return 'deno';
	if (versions.webcontainer && getEnv('SHELL').endsWith('/jsh')) return 'webcontainer';
	return 'node';
});

export function headerCase(name: string): string {
	return name.replace(/((^|\b|_)[a-z])/g, (s) => s.toUpperCase());
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

/** Cache a function's result after the first call */
export function once<T = any>(fn: () => T): () => T {
	let value: T;
	return () => {
		if (typeof value === 'undefined') value = fn();
		return value;
	};
}

export function trimSlash(
	input: string = '',
	config: { start?: boolean; end?: boolean } = { start: true, end: true },
) {
	if (config.start === true) input = input.replace(/^[\/\\]/, '');
	if (config.end === true) input = input.replace(/[\/\\]$/, '');
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
