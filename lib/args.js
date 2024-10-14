import { CLI_OPTIONS, PORTS_CONFIG } from './constants.js';
import { intRange } from './utils.js';

/**
@typedef {import('./types.js').HttpHeaderRule} HttpHeaderRule
@typedef {import('./types.js').ListenOptions} ListenOptions
@typedef {import('./types.js').ServerOptions} ServerOptions
@typedef {import('./utils.js').ErrorsContext} ErrorsContext
**/

export class CLIArgs {
	/**
	 * @type {Array<[string, string]>}
	 */
	#map = [];

	/**
	 * @type {string[]}
	 */
	#list = [];

	/**
	 * @param {string | string[]} keys
	 * @returns {(entry: [string, string]) => boolean}
	 */
	#mapFilter(keys) {
		return (entry) => (typeof keys === 'string' ? keys === entry[0] : keys.includes(entry[0]));
	}

	/**
	 * @param {string[]} args
	 */
	constructor(args) {
		const optionPattern = /^-{1,2}[\w]/;
		let pos = 0;
		while (pos < args.length) {
			const arg = args[pos];
			pos += 1;
			if (optionPattern.test(arg)) {
				const nextArg = args[pos];
				if (arg.includes('=')) {
					const index = arg.indexOf('=');
					this.add(arg.slice(0, index), arg.slice(index + 1));
				} else if (nextArg && !nextArg.startsWith('-')) {
					this.add(arg, nextArg);
					pos += 1;
				} else {
					this.add(arg, '');
				}
			} else {
				this.add(null, arg);
			}
		}
	}

	/**
	 * @param {string | null} key
	 * @param {string} value
	 */
	add(key, value) {
		if (key == null) {
			this.#list.push(value);
		} else {
			this.#map.push([key, value]);
		}
	}

	/**
	 * Check if args contain a value for one or several option names,
	 * or at a specific positional index.
	 * @param {number | string | string[]} keys
	 * @returns {boolean}
	 */
	has(keys) {
		if (typeof keys === 'number') {
			return typeof this.#list.at(keys) === 'string';
		} else {
			return this.#map.some(this.#mapFilter(keys));
		}
	}

	/**
	 * Get the last value for one or several option names,
	 * or a specific positional index.
	 * @param {number | string | string[]} query
	 * @returns {string | undefined}
	 */
	get(query) {
		if (typeof query === 'number') {
			return this.#list.at(query);
		} else {
			return this.all(query).at(-1);
		}
	}

	/**
	 * Get mapped values for one or several option names.
	 * Values are merged in order of appearance.
	 * @param {string | string[]} query
	 * @returns {string[]}
	 */
	all(query) {
		return this.#map.filter(this.#mapFilter(query)).map((entry) => entry[1]);
	}

	/**
	 * Get the names of all mapped options.
	 * @returns {string[]}
	 */
	keys() {
		/** @type {string[]} */
		const keys = [];
		for (const [key] of this.#map) {
			if (!keys.includes(key)) keys.push(key);
		}
		return keys;
	}

	data() {
		return structuredClone({
			map: this.#map,
			list: this.#list,
		});
	}
}

/** @type {(value?: string) => boolean} */
function isValidPattern(value) {
	return typeof value === 'string' && !/[\\\/\:]/.test(value);
}

/** @type {(include?: string, entries?: string[][]) => HttpHeaderRule} */
function makeHeadersRule(include = '', entries = []) {
	const headers = Object.fromEntries(entries);
	return include.length > 0 && include !== '*'
		? { headers, include: include.split(',').map((s) => s.trim()) }
		: { headers };
}

/**
 * @param {CLIArgs} args
 * @param {ErrorsContext} context
 * @returns {Partial<ListenOptions & ServerOptions>}
 */
export function parseArgs(args, context) {
	const knownArgs = Object.values(CLI_OPTIONS).flatMap((spec) => spec.args);
	for (const name of args.keys().filter((name) => !knownArgs.includes(name))) {
		context.warn(`unknown option '${name}'`);
	}

	/** @type {(input?: string) => string | undefined} */
	const trim = (input) => input?.trim();
	/** @type {(optName: string, input: string) => undefined} */
	const warn = (optName, input) => {
		context.warn(`invalid ${optName} value: ${JSON.stringify(input)}`);
	};

	/** @type {Partial<ListenOptions & ServerOptions>} */
	const options = {};

	const root = trim(args.get(0));
	const host = trim(args.get(CLI_OPTIONS.host.args));
	const port = trim(args.get(CLI_OPTIONS.port.args));
	const dirList = trim(args.get(CLI_OPTIONS.dirList.args));
	const gzip = trim(args.get(CLI_OPTIONS.gzip.args));
	const cors = trim(args.get(CLI_OPTIONS.cors.args));
	const dirFile = splitOptionValue(args.all(CLI_OPTIONS.dirFile.args));
	const ext = splitOptionValue(args.all(CLI_OPTIONS.ext.args));
	const exclude = splitOptionValue(args.all(CLI_OPTIONS.exclude.args));
	const headers = args.all(CLI_OPTIONS.header.args);

	if (root != null) {
		options.root = root;
	}
	if (host != null) {
		const ok = /^([A-Za-z0-9\.\-]+|[0-9\.\:]+)$/.test(host);
		if (ok) options.host = host;
		else warn('--host', host);
	}
	if (port != null) {
		const value = parsePort(port);
		if (Array.isArray(value)) options.ports = value;
		else warn('--port', port);
	}

	if (dirList != null) {
		const value = strToBool(dirList, true);
		if (value != null) options.dirList = value;
		else warn('--dir-list', dirList);
	}
	if (gzip != null) {
		const value = strToBool(gzip, true);
		if (value != null) options.gzip = value;
		else warn('--gzip', gzip);
	}
	if (cors != null) {
		const value = strToBool(cors, true);
		if (value != null) options.cors = value;
		else warn('--cors', cors);
	}

	if (dirFile.length) {
		options.dirFile = dirFile.filter((value) => {
			if (value === '') return false;
			const ok = isValidPattern(value);
			if (!ok) warn('--dir-name', value);
			return ok;
		});
	}
	if (ext.length) {
		const pattern = /^\.?[a-z\d]+(\.[a-z\d]+){0,5}$/i;
		options.ext = ext
			.filter((value) => {
				if (!value) return false;
				const ok = pattern.test(value);
				if (!ok) warn('--ext', value);
				return ok;
			})
			// normalize leading dot
			.map((value) => (value.startsWith('.') ? value : `.${value}`));
	}
	if (exclude.length) {
		options.exclude = exclude.filter((value) => {
			if (!value) return false;
			const ok = isValidPattern(value);
			if (!ok) warn('--exclude', value);
			return ok;
		});
	}
	if (headers.length) {
		options.headers = headers
			.map((value) => {
				const parsed = parseHeaders(value);
				if (parsed == null) warn('--header', value);
				return parsed;
			})
			.filter((item) => item != null);
	}

	return options;
}

/**
 * @param {string} input
 * @returns {HttpHeaderRule | undefined}
 */
export function parseHeaders(input) {
	input = input.trim();
	const colonPos = input.indexOf(':');
	const bracketPos = input.indexOf('{');

	// parse json syntax
	if (bracketPos >= 0 && colonPos > bracketPos && input.endsWith('}')) {
		const valTypes = ['string', 'boolean', 'number'];
		const jsonStart = input.indexOf('{');
		const include = input.slice(0, jsonStart).trim();
		const json = input.slice(jsonStart);
		try {
			const obj = JSON.parse(json);
			if (obj != null && typeof obj === 'object') {
				const entries = Object.entries(obj)
					.map(([key, val]) => [
						typeof key === 'string' ? key.trim() : '',
						valTypes.includes(typeof val) ? String(val).trim() : '',
					])
					.filter((entry) => entry[0].length > 0 && entry[1].length > 0);
				if (entries.length > 0) {
					return makeHeadersRule(include, entries);
				}
			}
		} catch {}
	}

	// parse header:value syntax
	else if (colonPos > 0) {
		const key = input.slice(0, colonPos).trim();
		const val = input.slice(colonPos + 1).trim();
		if (key && val) {
			const header = key.split(/\s+/).at(-1) ?? key;
			const include = header === key ? undefined : key.slice(0, key.indexOf(header)).trim();
			return makeHeadersRule(include, [[header, val]]);
		}
	}
}

/**
 * @param {string} input
 * @returns {number[] | undefined}
 */
export function parsePort(input) {
	const matches = input.match(/^(?<start>\d{1,})(?<end>\+|-\d{1,})?$/);
	if (matches?.groups) {
		const { start: rawStart = '', end: rawEnd = '' } = matches.groups;
		const { count, countLimit } = PORTS_CONFIG;
		const start = parseInt(rawStart, 10);
		if (rawEnd === '+') {
			return intRange(start, start + count - 1, countLimit);
		} else if (rawEnd.startsWith('-')) {
			return intRange(start, parseInt(rawEnd.slice(1), 10), countLimit);
		} else {
			return [start];
		}
	}
}

/** @type {(values: string[]) => string[]} */
export function splitOptionValue(values) {
	/** @type {string[]} */
	const result = [];
	for (let value of values.flatMap((s) => s.split(','))) {
		value = value.trim();
		if (value && !result.includes(value)) {
			result.push(value);
		}
	}
	return result;
}

/** @type {(input?: string, emptyValue?: boolean) => boolean | undefined} */
export function strToBool(input, emptyValue) {
	if (typeof input === 'string') {
		input = input.trim().toLowerCase();
	}
	if (input === 'true' || input === '1') {
		return true;
	} else if (input === 'false' || input === '0') {
		return false;
	} else if (input === '') {
		return emptyValue;
	}
}
