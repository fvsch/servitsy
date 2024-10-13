import { accessSync, constants as fsConstants, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { CLIArgs } from './args.js';
import {
	CLI_OPTIONS,
	DIR_FILE_DEFAULT,
	EXTENSIONS_DEFAULT,
	FILE_EXCLUDE_DEFAULT,
	HOSTS_WILDCARD,
	PORTS_CONFIG,
} from './constants.js';
import { errorsContext, intRange } from './utils.js';

/**
@typedef {import('./types.js').ErrorMessage} ErrorMessage
@typedef {import('./types.js').HttpHeaderRule} HttpHeaderRule
@typedef {import('./types.js').PortsConfig} PortsConfig
@typedef {import('./types.js').ListenOptions} ListenOptions
@typedef {import('./types.js').ServerOptions} ServerOptions
@typedef {import('./utils.js').ErrorsContext & { mode: 'arg' | 'option' }} ValidationContext
**/

/**
 * @param {Partial<ListenOptions & ServerOptions> & {args?: CLIArgs}} options
 * @returns {{errors: ErrorMessage[]; options: ListenOptions & ServerOptions}}
 */
export function serverOptions({ args, ...options }) {
	/** @type {ValidationContext} */
	const context = {
		mode: args ? 'arg' : 'option',
		...errorsContext(),
	};

	if (args) {
		validateArgPresence(args, context);
		return {
			options: {
				root: validateRoot(args.get(0), context),
				host: validateHost(args.get(CLI_OPTIONS.host.args), context),
				ports: validatePorts(args.get(CLI_OPTIONS.port.args), { ...context, config: PORTS_CONFIG }),
				ext: validateExt(args.all(CLI_OPTIONS.ext.args), context),
				dirFile: validateDirFile(args.all(CLI_OPTIONS.dirFile.args), context),
				dirList: validateDirList(args.get(CLI_OPTIONS.dirList.args), context),
				exclude: validateExclude(args.all(CLI_OPTIONS.exclude.args), context),
				cors: validateCors(args.get(CLI_OPTIONS.cors.args), context),
				headers: validateHeaders(args.all(CLI_OPTIONS.header.args), context),
				gzip: validateGzip(args?.get(CLI_OPTIONS.gzip.args), context),
			},
			errors: context.errors,
		};
	}

	return {
		options: {
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
		},
		errors: context.errors,
	};
}

/**
 * @param {CLIArgs} args
 * @param {ValidationContext} context
 * @returns
 */
export function validateArgPresence(args, { warn }) {
	const knownArgs = Object.values(CLI_OPTIONS).flatMap((spec) => spec.args);
	for (const name of args.keys()) {
		if (!knownArgs.includes(name)) {
			warn(`unknown option '${name}'`);
		}
	}
}

/**
 * @param {string | boolean | undefined} input
 * @param {ValidationContext & { optName: string; defaultValue: boolean; emptyValue: boolean }} context
 * @returns {boolean}
 */
function validateBoolean(input, { warn, mode, optName, defaultValue, emptyValue }) {
	if (mode === 'arg' && typeof input === 'string') {
		const value = strToBoolean(input, emptyValue);
		if (typeof value === 'boolean') {
			return value;
		} else {
			warn(`invalid ${optName} value: '${input}'`);
		}
	}
	if (mode === 'option' && input != null) {
		if (typeof input === 'boolean') {
			return input;
		} else {
			warn(`invalid ${optName} value: '${input}'`);
		}
	}
	return defaultValue;
}

/**
 * @param {string | boolean | undefined} input
 * @param {ValidationContext} context
 */
export function validateCors(input, context) {
	return validateBoolean(input, {
		...context,
		optName: context.mode === 'arg' ? '--cors' : 'cors',
		defaultValue: false,
		emptyValue: true,
	});
}

/**
 * @param {undefined | string[]} input
 * @param {ValidationContext} context
 * @returns {string[]}
 */
export function validateDirFile(input, { mode, warn }) {
	const optName = mode === 'arg' ? '--dir-file' : 'dirFile';

	/** @type {(value: any) => any} */
	const normalize = (value) => {
		return typeof value === 'string' ? value.trim() : value;
	};

	/** @type {(value: any) => boolean} */
	const valid = (value) => {
		if (value === '') return false; // drop value
		const ok = isValidPattern(value);
		if (!ok) warn(`invalid ${optName} value: '${value}'`);
		return ok;
	};

	if (mode === 'arg' && input?.length) {
		return splitOptionValue(input).map(normalize).filter(valid);
	}

	if (mode === 'option' && Array.isArray(input)) {
		return input.map(normalize).filter(valid);
	}

	return [...DIR_FILE_DEFAULT];
}

/**
 * @param {string | boolean | undefined} input
 * @param {ValidationContext} context
 */
export function validateDirList(input, context) {
	return validateBoolean(input, {
		...context,
		optName: context.mode === 'arg' ? '--dir-list' : 'dirList',
		defaultValue: true,
		emptyValue: true,
	});
}

/**
 * @param {string[] | undefined} input
 * @param {ValidationContext} context
 * @returns {string[]}
 */
export function validateExclude(input, { mode, warn }) {
	const name = mode === 'arg' ? '--exclude' : 'exclude';
	/** @type {(value?: string) => boolean} */
	const valid = (value) => {
		const ok = isValidPattern(value);
		if (!ok) warn(`ignoring invalid ${name} pattern: '${value}'`);
		return ok;
	};
	if (mode === 'arg' && input?.length) {
		return splitOptionValue(input)
			.filter((s) => s !== '')
			.filter(valid);
	} else if (mode === 'option' && Array.isArray(input)) {
		return input.filter(valid);
	}
	return [...FILE_EXCLUDE_DEFAULT];
}

/**
 * @param {undefined | string[]} input
 * @param {ValidationContext} context
 * @returns {string[]}
 */
export function validateExt(input, { mode, warn }) {
	const name = `${mode === 'arg' ? '--' : ''}ext`;
	const validPattern = /^(\.[a-z\d]+)+$/i;

	/** @type {(value: any) => any} */
	const normalize = (value) => {
		if (typeof value === 'string') {
			const ext = value.trim();
			if (ext === '') return ext;
			return ext === '' || ext.startsWith('.') ? ext : `.${ext}`;
		}
		return value;
	};

	/** @type {(value: any) => boolean} */
	const valid = (value) => {
		if (value === '') return false; // drop value
		const ok = typeof value === 'string' && validPattern.test(value);
		if (!ok) warn(`invalid ${name} value: '${value}'`);
		return ok;
	};

	if (mode === 'arg' && input?.length) {
		return splitOptionValue(input).map(normalize).filter(valid);
	}

	if (mode === 'option' && Array.isArray(input)) {
		return input.map(normalize).filter(valid);
	}

	return [...EXTENSIONS_DEFAULT];
}

/**
 * @param {string | boolean | undefined} input
 * @param {ValidationContext} context
 * @returns {boolean}
 */
export function validateGzip(input, context) {
	return validateBoolean(input, {
		...context,
		optName: context.mode === 'arg' ? '--gzip' : 'gzip',
		defaultValue: true,
		emptyValue: true,
	});
}

/**
 * @param {string[] | HttpHeaderRule[] | undefined} input
 * @param {ValidationContext} context
 * @returns {HttpHeaderRule[]}
 */
export function validateHeaders(input, context) {
	const optName = context.mode === 'arg' ? '--header' : 'headers';
	const setError = (/** @type {any} */ rule) =>
		context.error(`invalid ${optName} value: ${JSON.stringify(rule)}`);

	if (context.mode === 'arg' && Array.isArray(input) && input.length > 0) {
		return input
			.map((item) =>
				typeof item === 'string' ? parseHeaders(item, { ...context, optName }) : undefined,
			)
			.filter((item) => item != null)
			.filter((item) => {
				const ok = isValidHeaderRule(item);
				if (!ok) setError(item);
				return ok;
			});
	}

	if (context.mode === 'option' && Array.isArray(input) && input.length > 0) {
		return input.filter((item) => {
			const ok = isValidHeaderRule(item);
			if (!ok) setError(item);
			return ok;
		});
	}

	return [];
}

/**
 * @param {string | undefined} input
 * @param {ValidationContext} context
 * @returns {string}
 */
export function validateHost(input, { mode, error }) {
	const optionName = mode === 'arg' ? '--host' : 'host';
	/** @type {(value: string) => boolean} */
	const valid = (value) => {
		// only checking that all characters are valid for a domain or ip,
		// as a small usability nicety to catch obvious errors
		const ok = /^([A-Za-z0-9\.\-]+|[0-9\.\:]+)$/.test(value);
		if (!ok) error(`invalid ${optionName} value: '${value}'`);
		return ok;
	};

	if (typeof input === 'string') {
		const value = input.trim();
		if (valid(value)) return value;
	}

	return HOSTS_WILDCARD.v6;
}

/**
 * Validate the ports configuration.
 * Returns validation errors and a list of port numbers to try.
 * - '8000' -> [8000]
 * - '8000+' -> [8000, 8001, …, 8098, 8099]
 * - '8000-8010' -> [8000, 8001, …, 8009, 8010]
 * @param {string | number [] | undefined} input
 * @param {ValidationContext & { config: PortsConfig }} context
 * @returns {number[]}
 */
export function validatePorts(input, { mode, error, config }) {
	const minValue = 1;
	const maxValue = 65_535;
	const argPattern = /^(?<start>\d{1,})(?<end>\+|-\d{1,})?$/;

	/** @param {number} num */
	const portInRange = (num) => Math.floor(num) === num && num >= minValue && num <= maxValue;

	if (mode === 'option') {
		if (Array.isArray(input)) {
			const invalid = input.find((x) => typeof x !== 'number' || !portInRange(x));
			if (invalid) {
				error(`invalid port number '${invalid}'`);
			} else {
				return input;
			}
		}
	}

	if (mode === 'arg' && input != null) {
		const arg = String(input ?? '').trim();
		const matches = arg.match(argPattern);
		if (matches?.groups) {
			const { start: rawStart, end: rawEnd } = matches.groups;
			const start = parseInt(rawStart, 10);
			const end = rawEnd?.startsWith('-')
				? parseInt(rawEnd.slice(1), 10)
				: rawEnd === '+'
					? Math.min(maxValue, start + config.count - 1)
					: undefined;
			if (portInRange(start) && (end == null || portInRange(end))) {
				return intRange(start, end ?? start, config.countLimit);
			}
			for (const port of [start, end]) {
				if (typeof port === 'number' && !portInRange(port)) {
					error(`--port '${port}' is out of allowed range (${minValue}–${maxValue})`);
				}
			}
		} else {
			error(`invalid option --port='${arg}'`);
		}
	}

	return mode === 'arg'
		? intRange(config.initial, config.initial + config.count - 1, config.countLimit)
		: [config.initial];
}

/**
 * Validates the root directory.
 * @param {string | undefined} input
 * @param {ValidationContext} context
 * @returns {string}
 */
export function validateRoot(input, { mode, error }) {
	if (mode === 'option' && typeof input !== 'string') {
		error(`root directory must be a string; received: ${JSON.stringify(input)}`);
	}

	const root = resolve(input ?? '');

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

/** @type {(value: any) => value is HttpHeaderRule} */
function isValidHeaderRule(value) {
	const headerRegex = /^[A-Za-z0-9\-\_]+$/;
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

/**
 * @param {string} input
 * @param {ValidationContext & { optName: string }} context
 * @returns {HttpHeaderRule | undefined}
 */
export function parseHeaders(input, { optName, warn }) {
	input = input.trim();
	const colonPos = input.indexOf(':');
	const bracketPos = input.indexOf('{');

	/** @type {(include?: string, entries?: string[][]) => HttpHeaderRule} */
	const makeRule = (include = '', entries = []) => {
		const headers = Object.fromEntries(entries);
		return include.length > 0 && include !== '*'
			? { headers, include: include.split(',').map((s) => s.trim()) }
			: { headers };
	};

	if (bracketPos >= 0 && colonPos > bracketPos && input.endsWith('}')) {
		const jsonStart = input.indexOf('{');
		const include = input.slice(0, jsonStart).trim();
		const json = input.slice(jsonStart);
		let obj;
		try {
			obj = JSON.parse(json);
		} catch {}
		if (obj != null && typeof obj === 'object') {
			const valTypes = ['string', 'boolean', 'number'];
			const entries = Object.entries(obj)
				.map(([key, val]) => [
					typeof key === 'string' ? key : '',
					valTypes.includes(typeof val) ? String(val) : '',
				])
				.filter((entry) => entry[0].length > 0 && entry[1].length > 0);
			if (entries.length > 0) {
				return makeRule(include, entries);
			}
		} else {
			warn(`could not parse ${optName} value: '${json}'`);
		}
	} else if (colonPos > 0) {
		const key = input.slice(0, colonPos).trim();
		const val = input.slice(colonPos + 1).trim();
		if (key && val) {
			const header = key.split(/\s+/).at(-1) ?? key;
			const include = header === key ? undefined : key.slice(0, key.indexOf(header)).trim();
			return makeRule(include, [[header, val]]);
		} else {
			warn(`could not parse ${optName} value: '${input}'`);
		}
	} else if (input) {
		warn(`invalid ${optName} value: '${input}'`);
	}
}

/** @type {(value?: string) => boolean} */
function isValidPattern(value) {
	return typeof value === 'string' && !/[\\\/\:]/.test(value);
}

/** @type {(values: string[]) => string[]} */
function splitOptionValue(values) {
	const result = new Set(values.flatMap((s) => s.split(',')).map((s) => s.trim()));
	return Array.from(result);
}

/** @type {(input?: string, emptyValue?: boolean) => boolean | undefined} */
function strToBoolean(input = '', emptyValue) {
	const value = input.trim().toLowerCase();
	if (value === 'true' || value === '1') {
		return true;
	} else if (value === 'false' || value === '0') {
		return false;
	} else if (value === '') {
		return emptyValue;
	}
}
