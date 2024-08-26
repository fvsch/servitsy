import { basename, extname } from 'node:path';

import { DEFAULT_CHARSET, BIN_TYPES, TEXT_TYPES } from './constants.js';

/**
 * @type {(value: number, min: number, max: number) => number}
 */
export function clamp(value, min, max) {
	if (typeof value !== 'number') value = min;
	return Math.min(max, Math.max(min, value));
}

/**
 * @type {(filename: string, charset?: string | null) => string}
 */
export function contentType(filename, charset = DEFAULT_CHARSET) {
	const charsetSuffix = charset ? `; charset=${charset}` : '';
	const name = basename(filename).toLowerCase();
	const ext = extname(filename).replace('.', '').toLowerCase();

	if (ext) {
		if (Object.hasOwn(TEXT_TYPES.extensionMap, ext)) {
			return TEXT_TYPES.extensionMap[ext] + charsetSuffix;
		} else if (Object.hasOwn(BIN_TYPES.extensionMap, ext)) {
			return BIN_TYPES.extensionMap[ext];
		} else if (TEXT_TYPES.extension.includes(ext)) {
			return TEXT_TYPES.default + charsetSuffix;
		} else if (BIN_TYPES.extension.includes(ext)) {
			return BIN_TYPES.default;
		}
	} else {
		if (TEXT_TYPES.file.includes(name) || TEXT_TYPES.suffix.find((x) => name.endsWith(x))) {
			return TEXT_TYPES.default + charsetSuffix;
		}
	}

	return BIN_TYPES.default;
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
export function fwdPath(input = '') {
	const value = input.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
	return value.length > 1 ? value.replace(/\/$/g, '') : value;
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
