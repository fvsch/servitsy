import { CLI_OPTIONS, PORTS_CONFIG } from './constants.ts';
import type { HttpHeaderRule, OptionSpec, ServerOptions } from './types.d.ts';
import { intRange, printValue } from './utils.ts';

export class CLIArgs {
	#list: string[] = [];
	#map: [string, string][] = [];
	#mapFilter(keys: string | string[]) {
		if (typeof keys === 'string') {
			return (entry: [string, string]) => keys === entry[0];
		}
		return (entry: [string, string]) => keys.includes(entry[0]);
	}

	constructor(args: string[]) {
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

	add(key: string | null, value: string) {
		if (key == null) {
			this.#list.push(value);
		} else {
			this.#map.push([key, value]);
		}
	}

	has(query: number | string | string[]): boolean {
		if (typeof query === 'number') {
			return typeof this.#list.at(query) === 'string';
		} else {
			return this.#map.some(this.#mapFilter(query));
		}
	}

	/**
	Get the last value for one or several option names, or a specific positional index.
	*/
	get(query: number | string | string[]): string | undefined {
		if (typeof query === 'number') {
			return this.#list.at(query);
		} else {
			return this.all(query).at(-1);
		}
	}

	/**
	Get mapped values for one or several option names.
	Values are merged in order of appearance.
	*/
	all(query: string | string[]): string[] {
		return this.#map.filter(this.#mapFilter(query)).map((entry) => entry[1]);
	}

	keys() {
		const keys: string[] = [];
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

	options(onError?: (msg: string) => void): Partial<ServerOptions> {
		const invalid = (optName: string, input: any) => {
			onError?.(`invalid ${optName} value: ${printValue(input)}`);
		};

		const getStr = ({ names, negate }: OptionSpec) => {
			if (negate && this.has(negate)) return;
			const input = this.get(names);
			if (input != null) return input.trim();
		};

		const getList = ({ names, negate }: OptionSpec) => {
			if (negate && this.has(negate)) return [];
			const input = this.all(names);
			if (input.length) return splitOptionValue(input);
		};

		const getBool = ({ names, negate }: OptionSpec, emptyValue?: boolean) => {
			if (negate && this.has(negate)) return false;
			const input = this.get(names);
			const value = strToBool(input, emptyValue);
			if (typeof value === 'boolean') {
				return value;
			} else if (typeof input === 'string' && input.length > 0) {
				invalid(names.at(-1)!, input);
			}
		};

		const options: Partial<ServerOptions> = {
			root: this.get(0),
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

		const headers = this.all(CLI_OPTIONS.header.names)
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

		for (const name of this.unknown()) {
			onError?.(`unknown option '${name}'`);
		}

		// remove undefined values
		return Object.fromEntries(Object.entries(options).filter((entry) => entry[1] != null));
	}

	unknown(): string[] {
		const known = Object.values(CLI_OPTIONS).flatMap((spec) => {
			return spec.negate ? [...spec.names, spec.negate] : spec.names;
		});
		return this.keys().filter((name) => !known.includes(name));
	}
}

function makeHeadersRule(include: string = '', entries: string[][] = []): HttpHeaderRule {
	const headers = Object.fromEntries(entries);
	return include.length > 0 && include !== '*'
		? { headers, include: include.split(',').map((s) => s.trim()) }
		: { headers };
}

function normalizeExt(value: string = ''): string {
	if (typeof value === 'string' && value.length && !value.startsWith('.')) {
		return `.${value}`;
	}
	return value;
}

export function parseHeaders(input: string): HttpHeaderRule | undefined {
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

export function parsePort(input: string): number[] | undefined {
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

export function splitOptionValue(values: string[]): string[] {
	const result: string[] = [];
	for (let value of values.flatMap((s) => s.split(','))) {
		value = value.trim();
		if (value && !result.includes(value)) {
			result.push(value);
		}
	}
	return result;
}

export function strToBool(input?: string, emptyValue?: boolean) {
	const val = typeof input === 'string' ? input.trim().toLowerCase() : undefined;
	if (val === 'true' || val === '1') {
		return true;
	} else if (val === 'false' || val === '0') {
		return false;
	} else if (val === '') {
		return emptyValue;
	}
}
