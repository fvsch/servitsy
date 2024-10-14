import { accessSync, constants as fsConstants, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	DIR_FILE_DEFAULT,
	EXTENSIONS_DEFAULT,
	FILE_EXCLUDE_DEFAULT,
	HOSTS_WILDCARD,
	PORTS_CONFIG,
} from './constants.js';
import { intRange } from './utils.js';

/**
@typedef {import('./types.js').ErrorMessage} ErrorMessage
@typedef {import('./types.js').HttpHeaderRule} HttpHeaderRule
@typedef {import('./types.js').PortsConfig} PortsConfig
@typedef {import('./types.js').ListenOptions} ListenOptions
@typedef {import('./types.js').ServerOptions} ServerOptions
@typedef {import('./utils.js').ErrorsContext} ErrorsContext
**/

export class OptionsValidator {
	/**
	 * @param {ErrorsContext} context
	 */
	constructor(context) {
		this.errors = context.errors;
		this.error = context.error;
	}

	/**
	 * @param {boolean | undefined} input
	 * @param {string} optName
	 * @returns {boolean | undefined}
	 */
	bool(input, optName) {
		if (typeof input === 'undefined') return;
		if (typeof input === 'boolean') return input;
		else this.error(`invalid ${optName} value: '${input}'`);
	}

	/**
	 * @param {string[] | undefined} input
	 * @returns {string[] | undefined}
	 */
	dirFile(input) {
		if (!Array.isArray(input)) return;
		return input.filter((item) => {
			if (isValidPattern(item)) return true;
			else this.error(`invalid dirFile value: '${item}'`);
		});
	}

	/**
	 * @param {string[] | undefined} input
	 * @returns {string[] | undefined}
	 */
	exclude(input) {
		if (!Array.isArray(input)) return;
		return input.filter((item) => {
			if (isValidPattern(item)) return true;
			else this.error(`ignoring invalid exclude pattern: '${item}'`);
		});
	}

	/**
	 * @param {string[] | undefined} input
	 * @returns {string[] | undefined}
	 */
	ext(input) {
		if (!Array.isArray(input)) return;
		return input
			.filter((item) => {
				if (isValidExt(item)) return true;
				else this.error(`invalid ext value: '${item}'`);
			})
			.map(normalizeExt);
	}

	/**
	 * @param {HttpHeaderRule[] | undefined} input
	 * @returns {HttpHeaderRule[] | undefined}
	 */
	headers(input) {
		if (!Array.isArray(input)) return;
		return input.filter((rule) => {
			if (isValidHeaderRule(rule)) return true;
			else this.error(`invalid header value: ${JSON.stringify(rule)}`);
		});
	}

	/**
	 * @param {string | undefined} input
	 * @returns {string | undefined}
	 */
	host(input) {
		if (typeof input !== 'string') return;
		if (isValidHost(input)) return input;
		else this.error(`invalid host value: '${input}'`);
	}

	/**
	 * @param {number[] | undefined} input
	 * @returns {number[] | undefined}
	 */
	ports(input) {
		if (!Array.isArray(input)) return;
		const max = PORTS_CONFIG.maxCount;
		const value = input.length > max ? input.slice(0, max) : input;
		const invalid = value.find((num) => !isValidPort(num));
		if (typeof invalid === 'undefined') return value;
		else this.error(`invalid port number: '${invalid}'`);
	}

	/**
	 * @param {string} value
	 * @returns {string}
	 */
	root(value) {
		if (typeof value !== 'string') {
			throw new Error(`root directory must be a string; received: ${JSON.stringify(value)}`);
		}
		const root = resolve(value);
		try {
			const stats = statSync(root);
			if (stats.isDirectory()) {
				// needs r-x permissions to access contents of the directory
				accessSync(root, fsConstants.R_OK | fsConstants.X_OK);
			} else {
				this.error(`not a directory: ${root}`);
			}
		} catch (/** @type {any} */ err) {
			if (err.code === 'ENOENT') {
				this.error(`not a directory: ${root}`);
			} else if (err.code === 'EACCES') {
				this.error(`permission denied: ${root}`);
			} else {
				this.error(err.toString());
			}
		}
		return root;
	}
}

/**
 * @type {(input: unknown) => input is string[]}
 */
export function isStringArray(input) {
	return Array.isArray(input) && input.every((item) => typeof item === 'string');
}

/**
 * @type {(input: string) => boolean}
 */
export function isValidExt(input) {
	if (typeof input !== 'string' || !input) return false;
	return /^\.[\w\-]+(\.[\w\-]+){0,4}$/.test(input);
}

/**
 * @type {(name: string) => boolean}
 */
export function isValidHeader(name) {
	return typeof name === 'string' && /^[a-z\d\-\_]+$/i.test(name);
}

/**
 * @type {(value: any) => value is HttpHeaderRule}
 */
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
 * Checking that all characters are valid for a domain or ip,
 * as a usability nicety to catch obvious errors
 * @type {(input: string) => boolean}
 */
export function isValidHost(input) {
	if (typeof input !== 'string' || !input.length) return false;
	const domainLike = /^([a-z\d\-]+)(\.[a-z\d\-]+)*$/i;
	const ipLike = /^([\d\.]+|[a-f\d\:]+)$/i;
	return domainLike.test(input) || ipLike.test(input);
}

/**
 * @type {(value: string) => boolean}
 */
export function isValidPattern(value) {
	return typeof value === 'string' && value.length > 0 && !/[\\\/\:]/.test(value);
}

/**
 * @type {(num: number) => boolean}
 */
export function isValidPort(num) {
	return Number.isSafeInteger(num) && num >= 1 && num <= 65_535;
}

/**
 * @type {(value: string) => string}
 */
function normalizeExt(value = '') {
	return value.startsWith('.') ? value : `.${value}`;
}

/**
 * @type {(config: PortsConfig) => number[]}
 */
function portRange({ initial, count, maxCount }) {
	return intRange(initial, initial + count - 1, maxCount);
}

/**
 * @param {Partial<ListenOptions & ServerOptions>} options,
 * @param {ErrorsContext} context
 * @returns {ListenOptions & ServerOptions}
 */
export function serverOptions(options, context) {
	const defaultPorts = portRange(PORTS_CONFIG);
	const validator = new OptionsValidator(context);
	return {
		root: validator.root(options.root ?? ''),
		host: validator.host(options.host) ?? HOSTS_WILDCARD.v6,
		ports: validator.ports(options.ports ?? defaultPorts) ?? defaultPorts,
		ext: validator.ext(options.ext) ?? EXTENSIONS_DEFAULT,
		dirFile: validator.dirFile(options.dirFile) ?? DIR_FILE_DEFAULT,
		dirList: validator.bool(options.dirList, 'dirList') ?? true,
		exclude: validator.exclude(options.exclude) ?? FILE_EXCLUDE_DEFAULT,
		cors: validator.bool(options.cors, 'cors') ?? false,
		headers: validator.headers(options.headers) ?? [],
		gzip: validator.bool(options.gzip, 'gzip') ?? true,
	};
}
