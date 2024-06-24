import { accessSync, statSync, constants as fsConstants } from 'node:fs';
import nodePath from 'node:path';
import { cwd } from 'node:process';

import {
	CLI_OPTIONS,
	DIR_FILE_DEFAULT,
	EXTENSIONS_DEFAULT,
	FILE_EXCLUDE_DEFAULT,
	HOSTS_WILDCARD,
	PORTS_CONFIG,
	PORTS_RULES,
} from './constants.js';
import { CLIArgs } from './args.js';
import { errorsContext } from './logger.js';
import { intRange } from './utils.js';

/**
@typedef {import('./logger.js').ErrorMessage} ErrorMessage
@typedef {import('./logger.js').ErrorsContext} ErrorsContext
@typedef {import('./resolver.js').ResolveOptions} ResolveOptions
@typedef {ErrorsContext & { mode: 'arg' | 'option' }} ValidationContext
@typedef {{ host: string; ports: number[] }} ListenOptions
@typedef {{ root: string; cors: boolean } & ListenOptions & ResolveOptions} ServerOptions
**/

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
 * @param {Partial<ServerOptions>} options
 * @param {CLIArgs} [args]
 * @returns {{options: ServerOptions; errors: ErrorMessage[]}}
 */
export function serverOptions(options, args) {
	const mode = args ? 'arg' : 'option';
	/** @type {ValidationContext} */
	const context = { mode, ...errorsContext() };

	if (args) {
		validateArgPresence(args, context);
	}

	const root = validateRoot(mode === 'arg' ? args?.get(0) : options.root, context);
	const ports = validatePorts(mode === 'arg' ? args?.get(CLI_OPTIONS.port.args) : options.ports, {
		...context,
		config: PORTS_CONFIG,
	});
	const host = validateHost(
		mode === 'arg' ? args?.get(CLI_OPTIONS.host.args) : options.host,
		context,
	);

	const ext = validateExt(mode === 'arg' ? args?.all(CLI_OPTIONS.ext.args) : options.ext, context);
	const dirFile = validateDirFile(
		mode === 'arg' ? args?.all(CLI_OPTIONS.dirFile.args) : options.dirFile,
		context,
	);
	const dirList = validateDirList(
		mode === 'arg' ? args?.get(CLI_OPTIONS.dirList.args) : options.dirList,
		context,
	);
	const exclude = validateExclude(
		mode === 'arg' ? args?.all(CLI_OPTIONS.exclude.args) : options.exclude,
		context,
	);
	const cors = validateCors(
		mode === 'arg' ? args?.get(CLI_OPTIONS.cors.args) : options.cors,
		context,
	);

	return {
		errors: context.errors,
		options: { root, host, ports, ext, dirFile, dirList, exclude, cors },
	};
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
 * @param {string[] | undefined} input
 * @param {ValidationContext} context
 * @returns {string[]}
 */
export function validateExclude(input, { mode, warn }) {
	const name = mode === 'arg' ? '--exclude' : 'exclude';
	/** @type {(value?: string) => boolean} */
	const valid = (value) => {
		const ok = typeof value === 'string' && !/[\\\/]/.test(value);
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
 * @param {undefined | string[]} input
 * @param {ValidationContext} context
 * @returns {string[]}
 */
export function validateDirFile(input, { mode, warn }) {
	const optName = mode === 'arg' ? '--dir-file' : 'dirFile';
	/** @type {(value?: string) => boolean} */
	const valid = (value) => {
		const ok = typeof value === 'string' && !/[\\\/]/.test(value);
		if (!ok) warn(`invalid ${optName} value: '${value}'`);
		return ok;
	};
	if (mode === 'arg' && typeof input === 'string') {
		switch (strToBoolean(input)) {
			case true:
				return [...DIR_FILE_DEFAULT];
			case false:
				return [];
			default:
				return splitOptionValue(input)
					.filter((s) => s !== '')
					.filter(valid);
		}
	}
	if (mode === 'option' && Array.isArray(input)) {
		return input.filter(valid);
	}
	return [...DIR_FILE_DEFAULT];
}

/**
 * @param {undefined | string[]} input
 * @param {ValidationContext} context
 * @returns {string[]}
 */
export function validateExt(input, { mode, warn }) {
	const name = `${mode === 'arg' ? '--' : ''}ext`;
	/** @type {(value?: string) => boolean} */
	const valid = (value) => {
		const ok = typeof value === 'string' && /^(\.[a-z\d]+)+$/.test(value);
		if (!ok) warn(`invalid ${name} value: '${value}'`);
		return ok;
	};
	if (mode === 'arg' && typeof input === 'string') {
		switch (strToBoolean(input)) {
			case true:
				return [...DIR_FILE_DEFAULT];
			case false:
				return [];
			default:
				return splitOptionValue(input)
					.filter((s) => s !== '')
					.filter(valid);
		}
	}
	if (mode === 'option' && Array.isArray(input)) {
		return input.filter(valid);
	}
	return [...EXTENSIONS_DEFAULT];
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
 * @param {ValidationContext & { config: import('./constants.js').PortsConfig }} context
 * @returns {number[]}
 */
export function validatePorts(input, { mode, error, config }) {
	const argPattern = /^(?<start>\d{1,})(?<end>\+|-\d{1,})?$/;
	/** @param {number} num */
	const portInRange = (num) =>
		Math.floor(num) === num && num >= PORTS_RULES.minValue && num <= PORTS_RULES.maxValue;

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
					? Math.min(PORTS_RULES.maxValue, start + config.count - 1)
					: undefined;
			if (portInRange(start) && (end == null || portInRange(end))) {
				return intRange(start, end ?? start, PORTS_RULES.countLimit);
			}
			for (const port of [start, end]) {
				if (typeof port === 'number' && !portInRange(port)) {
					error(
						`--port '${port}' is out of allowed range (${PORTS_RULES.minValue}–${PORTS_RULES.maxValue})`,
					);
				}
			}
		} else {
			error(`invalid option --port='${arg}'`);
		}
	}

	return mode === 'arg'
		? intRange(config.initial, config.initial + config.count - 1, PORTS_RULES.countLimit)
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

	const root = nodePath.resolve(cwd(), typeof input === 'string' ? input : '');

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
