import { fileURLToPath } from 'node:url';

import { ColorUtils } from './color.js';

export const color = new ColorUtils();

/**
 * @type {(value: number, min: number, max: number) => number}
 */
export function clamp(value, min, max) {
	if (typeof value !== 'number') value = min;
	return Math.min(max, Math.max(min, value));
}

/**
 * @type {(input: string, context?: 'text' | 'attr') => string}
 */
export function escapeHtml(input, context = 'text') {
	if (typeof input !== 'string') return '';
	let result = input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
	if (context === 'attr') result = result.replaceAll(`"`, '&quot;').replaceAll(`'`, '&apos;');
	return result;
}

/**
 * @typedef {{
 * 	errors: import('./types.js').ErrorMessage[];
 * 	error: (msg: string) => void;
 * 	warn: (msg: string) => void;
 * }} ErrorsContext
 * @returns {ErrorsContext}
 */
export function errorsContext() {
	/** @type {import('./types.js').ErrorMessage[]} */
	const errors = [];
	return {
		errors,
		error(msg = '') {
			errors.push({ error: msg });
		},
		warn(msg = '') {
			errors.push({ warn: msg });
		},
	};
}

/**
 * @type {(input: string) => string}
 */
export function fwdSlash(input = '') {
	return input.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

/**
 * @param {string} name
 * @returns {string}
 */
export function headerCase(name) {
	return name.replace(/((^|\b|_)[a-z])/g, (s) => s.toUpperCase());
}

/**
 * @type {(moduleUrl: URL | string) => string}
 */
export function getDirname(moduleUrl) {
	return fileURLToPath(new URL('.', moduleUrl));
}

/**
 * @type {(address: string) => boolean}
 */
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

/**
 * @type {(start: number, end: number, limit?: number) => number[]}
 */
export function intRange(start, end, limit) {
	if (typeof limit === 'number') {
		if (limit < 0 || isNaN(limit)) throw new Error('Invalid limit: ' + limit);
		limit = Math.floor(limit);
	}
	start = Math.floor(start);
	end = Math.floor(end);
	const sign = start < end ? 1 : -1;
	const length = Math.abs(end - start) + 1;
	return Array(
		typeof limit === 'number' && limit >= 0 ? Math.min(length, Math.floor(limit)) : length,
	)
		.fill(undefined)
		.map((_, i) => start + i * sign);
}

/**
 * @type {(input: string, options?: { start?: boolean; end?: boolean }) => string}
 */
export function trimSlash(input = '', { start, end } = { start: true, end: true }) {
	if (start === true) input = input.replace(/^[\/\\]/, '');
	if (end === true) input = input.replace(/[\/\\]$/, '');
	return input;
}

export function withResolvers() {
	/** @type {{ resolve: (value?: any) => void; reject: (reason?: any) => void }} */
	const resolvers = {
		resolve: () => {},
		reject: () => {},
	};
	const promise = new Promise((resolve, reject) => {
		resolvers.resolve = resolve;
		resolvers.reject = reject;
	});
	return { promise, ...resolvers };
}
