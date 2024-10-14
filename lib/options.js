import { accessSync, constants as fsConstants, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	DIR_FILE_DEFAULT,
	EXTENSIONS_DEFAULT,
	FILE_EXCLUDE_DEFAULT,
	HOSTS_WILDCARD,
	PORTS_CONFIG,
} from './constants.js';

/**
@typedef {import('./types.js').ErrorMessage} ErrorMessage
@typedef {import('./types.js').HttpHeaderRule} HttpHeaderRule
@typedef {import('./types.js').PortsConfig} PortsConfig
@typedef {import('./types.js').ListenOptions} ListenOptions
@typedef {import('./types.js').ServerOptions} ServerOptions
@typedef {import('./utils.js').ErrorsContext} ErrorsContext
**/

/** @type {(value: any) => value is HttpHeaderRule} */
function isValidHeaderRule(value) {
	const headerRegex = /^[a-z\d\-\_]+$/i;
	const include = value?.include;
	const headers = value?.headers;
	if (Array.isArray(include) && include.some((item) => typeof item !== 'string')) {
		return false;
	}
	if (headers == null || typeof headers !== 'object') {
		return false;
	}
	const entries = Object.entries(headers);
	return (
		entries.length > 0 &&
		entries.every(([key, value]) => {
			return (
				typeof key === 'string' &&
				headerRegex.test(key) &&
				typeof value === 'string' &&
				value.length > 0
			);
		})
	);
}

/** @type {(value?: string) => boolean} */
function isValidPattern(value) {
	return typeof value === 'string' && !/[\\\/\:]/.test(value);
}

/**
 * @param {Partial<ListenOptions & ServerOptions>} options,
 * @param {ErrorsContext} context
 * @returns {ListenOptions & ServerOptions}
 */
export function serverOptions(options, context) {
	return {
		root: validateRoot(options.root, context),
		host: validateHost(options.host, context),
		ports: validatePorts(options.ports, { ...context, config: PORTS_CONFIG }),
		ext: validateExt(options.ext, context),
		dirFile: validateDirFile(options.dirFile, context),
		dirList: validateDirList(options.dirList, context),
		exclude: validateExclude(options.exclude, context),
		cors: validateCors(options.cors, context),
		headers: validateHeaders(options.headers, context),
		gzip: validateGzip(options.gzip, context),
	};
}

/** @type {(values: string[]) => string[]} */
function splitOptionValue(values) {
	const result = new Set(values.flatMap((s) => s.split(',')).map((s) => s.trim()));
	return Array.from(result);
}

/**
 * @param {string | boolean | undefined} input
 * @param {ErrorsContext & { optName: string; defaultValue: boolean }} context
 * @returns {boolean}
 */
function validateBoolean(input, { warn, optName, defaultValue }) {
	if (typeof input === 'boolean') {
		return input;
	} else if (input != null) {
		warn(`invalid ${optName} value: '${input}'`);
	}
	return defaultValue;
}

/**
 * @param {boolean | undefined} input
 * @param {ErrorsContext} context
 */
export function validateCors(input, context) {
	return validateBoolean(input, {
		...context,
		optName: 'cors',
		defaultValue: false,
	});
}

/**
 * @param {undefined | string[]} input
 * @param {ErrorsContext} context
 * @returns {string[]}
 */
export function validateDirFile(input, { warn }) {
	if (Array.isArray(input)) {
		return input
			.map((value) => (typeof value === 'string' ? value.trim() : value))
			.filter((value) => {
				if (value === '') return false; // drop value
				const ok = isValidPattern(value);
				if (!ok) warn(`invalid dirFile value: '${value}'`);
				return ok;
			});
	}

	return [...DIR_FILE_DEFAULT];
}

/**
 * @param {boolean | undefined} input
 * @param {ErrorsContext} context
 */
export function validateDirList(input, context) {
	return validateBoolean(input, { ...context, optName: 'dirList', defaultValue: true });
}

/**
 * @param {string[] | undefined} input
 * @param {ErrorsContext} context
 * @returns {string[]}
 */
export function validateExclude(input, { warn }) {
	if (Array.isArray(input)) {
		return input.filter((value) => {
			const ok = isValidPattern(value);
			if (!ok) warn(`ignoring invalid exclude pattern: '${value}'`);
			return ok;
		});
	}
	return [...FILE_EXCLUDE_DEFAULT];
}

/**
 * @param {undefined | string[]} input
 * @param {ErrorsContext} context
 * @returns {string[]}
 */
export function validateExt(input, { warn }) {
	const extPattern = /^(\.[a-z\d]+)+$/i;
	if (Array.isArray(input)) {
		return input.filter((value) => {
			if (typeof value !== 'string' || value === '') return false;
			const ok = extPattern.test(value);
			if (!ok) warn(`invalid ext value: '${value}'`);
			return ok;
		});
	}
	return [...EXTENSIONS_DEFAULT];
}

/**
 * @param {boolean | undefined} input
 * @param {ErrorsContext} context
 * @returns {boolean}
 */
export function validateGzip(input, context) {
	return validateBoolean(input, { ...context, optName: 'gzip', defaultValue: true });
}

/**
 * @param {HttpHeaderRule[] | undefined} input
 * @param {ErrorsContext} context
 * @returns {HttpHeaderRule[]}
 */
export function validateHeaders(input, { warn }) {
	if (Array.isArray(input) && input.length > 0) {
		return input.filter((rule) => {
			const ok = isValidHeaderRule(rule);
			if (!ok) warn(`invalid header value: ${JSON.stringify(rule)}`);
			return ok;
		});
	}
	return [];
}

/**
 * @param {string | undefined} input
 * @param {ErrorsContext} context
 * @returns {string}
 */
export function validateHost(input, { warn }) {
	// only checking that all characters are valid for a domain or ip,
	// as a small usability nicety to catch obvious errors
	const hostPattern = /^([a-z\d\.\-]+|[\d\.\:]+)$/i;
	const valid = (value = '') => {
		const ok = hostPattern.test(value);
		if (!ok) warn(`invalid host value: '${value}'`);
		return ok;
	};
	if (typeof input === 'string') {
		const value = input.trim();
		if (valid(value)) return value;
	}
	return HOSTS_WILDCARD.v6;
}

/**
 * @param {number[] | undefined} input
 * @param {ErrorsContext & { config: PortsConfig }} context
 * @returns {number[]}
 */
export function validatePorts(input, { error, config }) {
	const minValue = 1;
	const maxValue = 65_535;
	/** @param {number} num */
	const portInRange = (num) => Math.floor(num) === num && num >= minValue && num <= maxValue;

	if (Array.isArray(input)) {
		const invalid = input.find((x) => typeof x !== 'number' || !portInRange(x));
		if (invalid) {
			error(`invalid port number: '${invalid}'`);
		} else {
			return input;
		}
	}

	return [config.initial];
}

/**
 * @param {string | undefined} input
 * @param {ErrorsContext} context
 * @returns {string}
 */
export function validateRoot(input = '', { error }) {
	if (typeof input !== 'string') {
		throw new Error(`root directory must be a string; received: ${JSON.stringify(input)}`);
	}
	const root = resolve(input);
	try {
		const stats = statSync(root);
		if (stats.isDirectory()) {
			// needs r-x permissions to access contents of the directory
			accessSync(root, fsConstants.R_OK | fsConstants.X_OK);
		} else {
			error(`not a directory: ${root}`);
		}
	} catch (/** @type {any} */ err) {
		if (err.code === 'ENOENT') {
			error(`not a directory: ${root}`);
		} else if (err.code === 'EACCES') {
			error(`permission denied: ${root}`);
		} else {
			error(err.toString());
		}
	}
	return root;
}
