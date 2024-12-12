import { parseArgs, type ParseArgsConfig } from 'node:util';

import { PORTS_CONFIG } from './constants.ts';
import type { HttpHeaderRule, ServerOptions } from './types.d.ts';
import { intRange, printValue } from './utils.ts';

const PARSE_ARGS_OPTIONS: ParseArgsConfig['options'] = {
	help: { type: 'boolean' },
	version: { type: 'boolean' },
	host: { type: 'string', short: 'h' },
	port: { type: 'string', short: 'p' },
	// allow plural as alias to 'ports'
	ports: { type: 'string' },
	header: { type: 'string', multiple: true },
	// allow plural as alias to 'header'
	headers: { type: 'string', multiple: true },
	cors: { type: 'boolean' },
	'no-cors': { type: 'boolean' },
	gzip: { type: 'boolean' },
	'no-gzip': { type: 'boolean' },
	ext: { type: 'string', multiple: true },
	'no-ext': { type: 'boolean' },
	index: { type: 'string', multiple: true },
	'no-index': { type: 'boolean' },
	list: { type: 'boolean' },
	'no-list': { type: 'boolean' },
	exclude: { type: 'string', multiple: true },
	'no-exclude': { type: 'boolean' },
};

export class CLIArgs {
	#args: string[];
	#pos: string[];
	#val: Record<string, string[] | string | boolean | undefined>;

	constructor(args: string[]) {
		this.#args = args;
		const { positionals, values } = parseArgs({
			args: this.#cleanArgs(args),
			options: PARSE_ARGS_OPTIONS,
			strict: false,
		});
		this.#val = values;
		this.#pos = positionals.filter((s) => !optionLike(s));
	}

	/**
	parseArgs treats '-abc=xyz' by splitting all characters and returns
	{a:true, b:true, c:true, '=': true, …}
	since we don't support single-char boolean options, and such input
	is likely a user mistake, let's drop those
	*/
	#cleanArgs(args: string[]): string[] {
		const clean: string[] = [];
		const shortEqual = /^-[a-z]=/i;
		const shortCombo = /^-[a-z\d]{2,}/i;
		for (const arg of args) {
			if (arg.startsWith('-')) {
				if (shortEqual.test(arg)) {
					clean.push(...arg.split('='));
					continue;
				} else if (shortCombo.test(arg)) {
					continue;
				}
			}
			clean.push(arg);
		}
		return clean;
	}

	#neg(name: string): boolean {
		return this.get(`no-${name}`) === true;
	}

	#rawKeys() {
		const keys: string[] = [];
		for (const arg of this.#args) {
			if (!optionLike(arg)) continue;
			const name = arg.includes('=') ? arg.slice(0, arg.indexOf('=')).trim() : arg.trim();
			if (!keys.includes(name)) keys.push(name);
		}
		return keys;
	}

	pos(index: number): string | undefined {
		return this.#pos.at(index);
	}

	get(name: string): string[] | string | boolean | undefined {
		return this.#val[name];
	}

	bool(name: string): boolean | undefined {
		if (this.#neg(name)) return false;
		let value = this.get(name);
		if (typeof value === 'boolean') return value;
	}

	str(name: string): string | undefined {
		if (this.#neg(name)) return;
		let value = this.get(name);
		if (typeof value === 'string') return value.trim();
	}

	list(name: string): string[] | undefined {
		if (this.#neg(name)) return [];
		const value = this.#val[name];
		if (Array.isArray(value)) return value;
	}

	splitList(name: string) {
		const value = this.list(name);
		if (Array.isArray(value)) {
			return splitOptionValue(value);
		}
	}

	data() {
		return structuredClone({ pos: this.#pos, val: this.#val });
	}

	options(onError?: (msg: string) => void): Partial<ServerOptions> {
		const invalid = (optName: string, input: any) => {
			onError?.(`invalid ${optName} value: ${printValue(input)}`);
		};

		const options: Partial<ServerOptions> = {
			root: this.pos(0),
			host: this.str('host'),
			cors: this.bool('cors'),
			gzip: this.bool('gzip'),
			index: this.splitList('index'),
			list: this.bool('list'),
			exclude: this.splitList('exclude'),
		};

		// args that require extra parsing
		const port = this.str('port') ?? this.str('ports');
		if (port != null) {
			const value = parsePort(port);
			if (value != null) options.ports = value;
			else invalid('--port', port);
		}

		const headers = [this.list('header'), this.list('headers')]
			.flat()
			.map((value) => {
				if (typeof value !== 'string' || !value.trim()) return;
				const rule = parseHeaders(value);
				if (!rule) invalid('--header', value);
				return rule;
			})
			.filter((rule) => rule != null);
		if (headers.length) {
			options.headers = headers;
		}

		const ext = this.splitList('ext');
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
		const known: string[] = [];
		for (const [key, opt] of Object.entries(PARSE_ARGS_OPTIONS || {})) {
			known.push(`--${key}`);
			if (opt.short) known.push(`-${opt.short}`);
		}
		return this.#rawKeys().filter((name) => !known.includes(name));
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

function optionLike(name: string) {
	name = name.trim();
	return name.startsWith('-') && /\s/.test(name) === false;
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
