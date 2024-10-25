import { isAbsolute, resolve } from 'node:path';

import { DEFAULT_OPTIONS, PORTS_CONFIG } from './constants.js';

/**
@typedef {import('./types.d.ts').ErrorList} ErrorList
@typedef {import('./types.d.ts').HttpHeaderRule} HttpHeaderRule
@typedef {import('./types.d.ts').ServerOptions} ServerOptions
*/

export class OptionsValidator {
	/** @param {ErrorList} [errorList] */
	constructor(errorList) {
		this.errorList = errorList;
	}

	/**
	@type {<T = string>(input: T[] | undefined, filterFn: (item: T) => boolean) => T[] | undefined}
	*/
	#array(input, filterFn) {
		if (!Array.isArray(input)) return;
		if (input.length === 0) return input;
		const value = input.filter(filterFn);
		if (value.length) return value;
	}

	/**
	@type {(optName: string, input?: boolean) => boolean | undefined}
	*/
	#bool(optName, input) {
		if (typeof input === 'undefined') return;
		if (typeof input === 'boolean') return input;
		else this.#error(`invalid ${optName} value: '${input}'`);
	}

	#error(msg = '') {
		this.errorList?.(msg);
	}

	/** @type {(input?: boolean) => boolean | undefined} */
	cors(input) {
		return this.#bool('cors', input);
	}

	/** @type {(input?: string[]) => string[] | undefined} */
	dirFile(input) {
		return this.#array(input, (item) => {
			const ok = isValidPattern(item);
			if (!ok) this.#error(`invalid dirFile value: '${item}'`);
			return ok;
		});
	}

	/** @type {(input?: boolean) => boolean | undefined} */
	dirList(input) {
		return this.#bool('dirList', input);
	}

	/** @type {(input?: string[]) => string[] | undefined} */
	exclude(input) {
		return this.#array(input, (item) => {
			const ok = isValidPattern(item);
			if (!ok) this.#error(`invalid exclude pattern: '${item}'`);
			return ok;
		});
	}

	/** @type {(input?: string[]) => string[] | undefined} */
	ext(input) {
		return this.#array(input, (item) => {
			const ok = isValidExt(item);
			if (!ok) this.#error(`invalid ext value: '${item}'`);
			return ok;
		});
	}

	/** @type {(input?: boolean) => boolean | undefined} */
	gzip(input) {
		return this.#bool('gzip', input);
	}

	/** @type {(input?: HttpHeaderRule[]) => HttpHeaderRule[] | undefined} */
	headers(input) {
		return this.#array(input, (rule) => {
			const ok = isValidHeaderRule(rule);
			if (!ok) this.#error(`invalid header value: ${JSON.stringify(rule)}`);
			return ok;
		});
	}

	/** @type {(input?: string) => string | undefined} */
	host(input) {
		if (typeof input !== 'string') return;
		if (isValidHost(input)) return input;
		else this.#error(`invalid host value: '${input}'`);
	}

	/** @type {(input?: number[]) => number[] | undefined} */
	ports(input) {
		if (!Array.isArray(input) || input.length === 0) return;
		const value = input.slice(0, PORTS_CONFIG.maxCount);
		const invalid = value.find((num) => !isValidPort(num));
		if (typeof invalid === 'undefined') return value;
		else this.#error(`invalid port number: '${invalid}'`);
	}

	/** @type {(input?: string) => string} */
	root(input) {
		const value = typeof input === 'string' ? input : '';
		return isAbsolute(value) ? value : resolve(value);
	}
}

/** @type {(input: unknown) => input is string[]} */
export function isStringArray(input) {
	return Array.isArray(input) && input.every((item) => typeof item === 'string');
}

/** @type {(input: string) => boolean} */
export function isValidExt(input) {
	if (typeof input !== 'string' || !input) return false;
	return /^\.[\w\-]+(\.[\w\-]+){0,4}$/.test(input);
}

/** @type {(name: string) => boolean} */
export function isValidHeader(name) {
	return typeof name === 'string' && /^[a-z\d\-\_]+$/i.test(name);
}

/** @type {(value: any) => value is HttpHeaderRule} */
export function isValidHeaderRule(value) {
	const include = value?.include;
	const headers = value?.headers;
	if (typeof include !== 'undefined' && !isStringArray(include)) {
		return false;
	}
	if (headers == null || typeof headers !== 'object') {
		return false;
	}
	const entries = Object.entries(headers);
	return (
		entries.length > 0 &&
		entries.every(([key, value]) => {
			if (!isValidHeader(key)) return false;
			return typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value);
		})
	);
}

/**
Checking that all characters are valid for a domain or ip,
as a usability nicety to catch obvious errors
@type {(input: string) => boolean}
*/
export function isValidHost(input) {
	if (typeof input !== 'string' || !input.length) return false;
	const domainLike = /^([a-z\d\-]+)(\.[a-z\d\-]+)*$/i;
	const ipLike = /^([\d\.]+|[a-f\d\:]+)$/i;
	return domainLike.test(input) || ipLike.test(input);
}

/** @type {(value: string) => boolean} */
export function isValidPattern(value) {
	return typeof value === 'string' && value.length > 0 && !/[\\\/\:]/.test(value);
}

/** @type {(num: number) => boolean} */
export function isValidPort(num) {
	return Number.isSafeInteger(num) && num >= 1 && num <= 65_535;
}

/**
@param {{ root: string } & Partial<ServerOptions>} options
@param {{ error: ErrorList }} [context]
@returns {ServerOptions}
*/
export function serverOptions(options, context) {
	const validator = new OptionsValidator(context?.error);

	/** @type {Partial<ServerOptions>} */
	const checked = {
		ports: validator.ports(options.ports),
		gzip: validator.gzip(options.gzip),
		host: validator.host(options.host),
		cors: validator.cors(options.cors),
		headers: validator.headers(options.headers),
		dirFile: validator.dirFile(options.dirFile),
		dirList: validator.dirList(options.dirList),
		ext: validator.ext(options.ext),
		exclude: validator.exclude(options.exclude),
	};

	const final = {
		root: validator.root(options.root),
		...structuredClone(DEFAULT_OPTIONS),
	};
	for (const [key, value] of Object.entries(checked)) {
		// @ts-ignore
		if (typeof value !== 'undefined') final[key] = value;
	}

	return final;
}
