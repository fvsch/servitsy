import { CLI_OPTIONS, PORTS_CONFIG } from './constants.js';
import { intRange } from './utils.js';

/**
@typedef {import('./types.d.ts').HttpHeaderRule} HttpHeaderRule
@typedef {import('./types.d.ts').OptionSpec} OptionSpec
@typedef {import('./types.d.ts').ServerOptions} ServerOptions
*/

export class CLIArgs {
	/** @type {Array<[string, string]>} */
	#map = [];

	/** @type {string[]} */
	#list = [];

	/** @type {(keys: string | string[]) => (entry: [string, string]) => boolean} */
	#mapFilter(keys) {
		return (entry) => (typeof keys === 'string' ? keys === entry[0] : keys.includes(entry[0]));
	}

	/** @param {string[]} args */
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

	/** @type {(key: string | null, value: string) => void} */
	add(key, value) {
		if (key == null) {
			this.#list.push(value);
		} else {
			this.#map.push([key, value]);
		}
	}

	/** @type {(query: number | string | string[]) => boolean} */
	has(query) {
		if (typeof query === 'number') {
			return typeof this.#list.at(query) === 'string';
		} else {
			return this.#map.some(this.#mapFilter(query));
		}
	}

	/**
	Get the last value for one or several option names, or a specific positional index.
	@type {(query: number | string | string[]) => string | undefined}
	*/
	get(query) {
		if (typeof query === 'number') {
			return this.#list.at(query);
		} else {
			return this.all(query).at(-1);
		}
	}

	/**
	Get mapped values for one or several option names.
	Values are merged in order of appearance.
	@type {(query: string | string[]) => string[]} query
	*/
	all(query) {
		return this.#map.filter(this.#mapFilter(query)).map((entry) => entry[1]);
	}

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

/** @type {(include?: string, entries?: string[][]) => HttpHeaderRule} */
function makeHeadersRule(include = '', entries = []) {
	const headers = Object.fromEntries(entries);
	return include.length > 0 && include !== '*'
		? { headers, include: include.split(',').map((s) => s.trim()) }
		: { headers };
}

/** @type {(value: string) => string} */
function normalizeExt(value = '') {
	if (typeof value === 'string' && value.length && !value.startsWith('.')) {
		return `.${value}`;
	}
	return value;
}

/** @type {(args: CLIArgs, context: { onError(msg: string): void }) => Partial<ServerOptions>} */
export function parseArgs(args, { onError }) {
	const invalid = (optName = '', input = '') => {
		const value =
			typeof input === 'string' ? `'${input.replaceAll(`'`, `\'`)}'` : JSON.stringify(input);
		onError(`invalid ${optName} value: ${value}`);
	};

	/** @type {(spec: OptionSpec) => string | undefined} */
	const getStr = ({ names: argNames, negate: negativeArg }) => {
		if (negativeArg && args.has(negativeArg)) return;
		const input = args.get(argNames);
		if (input != null) return input.trim();
	};

	/** @type {(spec: OptionSpec) => string[] | undefined} */
	const getList = ({ names: argNames, negate: negativeArg }) => {
		if (negativeArg && args.has(negativeArg)) return [];
		const input = args.all(argNames);
		if (input.length) return splitOptionValue(input);
	};

	/** @type {(spec: OptionSpec, emptyValue?: boolean) => boolean | undefined} */
	const getBool = ({ names: argNames, negate: negativeArg }, emptyValue) => {
		if (negativeArg && args.has(negativeArg)) return false;
		const input = args.get(argNames);
		if (input == null) return;
		const value = strToBool(input, emptyValue);
		if (value != null) return value;
		else invalid(argNames.at(-1), input);
	};

	/** @type {Partial<ServerOptions>} */
	const options = {
		root: args.get(0),
		host: getStr(CLI_OPTIONS.host),
		cors: getBool(CLI_OPTIONS.cors),
		gzip: getBool(CLI_OPTIONS.gzip),
		dirFile: getList(CLI_OPTIONS.dirFile),
		dirList: getBool(CLI_OPTIONS.dirList),
		exclude: getList(CLI_OPTIONS.exclude),
	};

	// args that require extra parsing
	const port = getStr(CLI_OPTIONS.port);
	if (port != null) {
		const value = parsePort(port);
		if (value != null) options.ports = value;
		else invalid('--port', port);
	}

	const headers = args
		.all(CLI_OPTIONS.header.names)
		.map((value) => {
			if (!value.trim()) return;
			const rule = parseHeaders(value);
			if (!rule) invalid('--header', value);
			return rule;
		})
		.filter((rule) => rule != null);
	if (headers.length) {
		options.headers = headers;
	}

	const ext = getList(CLI_OPTIONS.ext);
	if (ext != null) {
		options.ext = ext.map((item) => normalizeExt(item));
	}

	for (const name of unknownArgs(args)) {
		onError(`unknown option '${name}'`);
	}

	// remove undefined values
	return Object.fromEntries(Object.entries(options).filter((entry) => entry[1] != null));
}

/** @type {(input: string) => HttpHeaderRule | undefined} */
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

/** @type {(input: string) => number[] | undefined} */
export function parsePort(input) {
	const matches = input.match(/^(?<start>\d{1,})(?<end>\+|-\d{1,})?$/);
	if (matches?.groups) {
		const { start: rawStart = '', end: rawEnd = '' } = matches.groups;
		const { count, maxCount } = PORTS_CONFIG;
		const start = parseInt(rawStart, 10);
		if (rawEnd === '+') {
			return intRange(start, start + count - 1, maxCount);
		} else if (rawEnd.startsWith('-')) {
			return intRange(start, parseInt(rawEnd.slice(1), 10), maxCount);
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

/** @type {(args: CLIArgs) => string[]} */
export function unknownArgs(args) {
	const known = Object.values(CLI_OPTIONS).flatMap((spec) => {
		return spec.negate ? [...spec.names, spec.negate] : spec.names;
	});
	return args.keys().filter((name) => !known.includes(name));
}
