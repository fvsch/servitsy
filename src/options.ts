import { isAbsolute, resolve } from 'node:path';

import { DEFAULT_OPTIONS, PORTS_CONFIG } from './constants.ts';
import type { HttpHeaderRule, ServerOptions } from './types.d.ts';
import { printValue } from './utils.ts';

export function serverOptions(
	options: ServerOptions,
	onError: (msg: string) => void,
): Required<ServerOptions> {
	const validator = new OptionsValidator(onError);

	const checked: Omit<ServerOptions, 'root'> = {
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

	const final = structuredClone({
		root: validator.root(options.root),
		...DEFAULT_OPTIONS,
	});
	for (const [key, value] of Object.entries(checked)) {
		if (typeof value !== 'undefined') {
			(final as Record<string, any>)[key] = value;
		}
	}

	return final;
}

export class OptionsValidator {
	#errorCb;
	constructor(onError: (msg: string) => void) {
		this.#errorCb = onError;
	}

	#error(msg: string, input: any) {
		this.#errorCb(`${msg}: ${printValue(input)}`);
	}

	#arr<T>(input: T[] | undefined, msg: string, validFn: (item: T) => boolean): T[] | undefined {
		if (typeof input === 'undefined') return;
		if (Array.isArray(input)) {
			if (input.length === 0) return input;
			const valid = input.filter((item) => {
				if (validFn(item)) return true;
				this.#error(msg, item);
			});
			if (valid.length) {
				return valid;
			}
		} else {
			this.#error(msg, input);
		}
	}

	#bool(input: boolean | undefined, msg: string): boolean | undefined {
		if (typeof input === 'undefined') return;
		if (typeof input === 'boolean') return input;
		else this.#error(msg, input);
	}

	#str(
		input: string | undefined,
		msg: string,
		isValid: (input: string) => boolean,
	): string | undefined {
		if (typeof input === 'undefined') return;
		if (typeof input === 'string' && isValid(input)) return input;
		else this.#error(msg, input);
	}

	cors(input?: boolean): boolean | undefined {
		return this.#bool(input, 'invalid cors value');
	}

	dirFile(input?: string[]): string[] | undefined {
		return this.#arr(input, 'invalid dirFile value', isValidPattern);
	}

	dirList(input?: boolean): boolean | undefined {
		return this.#bool(input, 'invalid dirList value');
	}

	exclude(input?: string[]): string[] | undefined {
		return this.#arr(input, 'invalid exclude pattern', isValidPattern);
	}

	ext(input?: string[]): string[] | undefined {
		return this.#arr(input, 'invalid ext value', isValidExt);
	}

	gzip(input?: boolean): boolean | undefined {
		return this.#bool(input, 'invalid gzip value');
	}

	headers(input?: HttpHeaderRule[]): HttpHeaderRule[] | undefined {
		return this.#arr(input, 'invalid header value', isValidHeaderRule);
	}

	host(input?: string): string | undefined {
		return this.#str(input, 'invalid host value', isValidHost);
	}

	ports(input?: number[]): number[] | undefined {
		if (typeof input === 'undefined') return;
		if (!Array.isArray(input)) {
			this.#error('invalid port value', input);
			return;
		}
		if (input.length === 0) return;
		const value = input.slice(0, PORTS_CONFIG.maxCount);
		const invalid = value.find((num) => !isValidPort(num));
		if (typeof invalid === 'undefined') {
			return value;
		} else {
			this.#error('invalid port number', invalid);
		}
	}

	root(input?: string): string {
		const value = typeof input === 'string' ? input : '';
		return isAbsolute(value) ? value : resolve(value);
	}
}

function isStringArray(input: unknown): input is string[] {
	return Array.isArray(input) && input.every((item) => typeof item === 'string');
}

export function isValidExt(input: string): boolean {
	if (typeof input !== 'string' || !input) return false;
	return /^\.[\w\-]+(\.[\w\-]+){0,4}$/.test(input);
}

export function isValidHeader(name: string): boolean {
	return typeof name === 'string' && /^[a-z\d\-\_]+$/i.test(name);
}

/** @type {(value: any) => value is HttpHeaderRule} */
export function isValidHeaderRule(value: unknown): value is HttpHeaderRule {
	if (!value || typeof value !== 'object') return false;
	const { include, headers } = value as any;
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

// Checking that all characters are valid for a domain or ip,
// as a usability nicety to catch obvious errors
export function isValidHost(input: string): boolean {
	if (typeof input !== 'string' || !input.length) return false;
	const domainLike = /^([a-z\d\-]+)(\.[a-z\d\-]+)*$/i;
	const ipLike = /^([\d\.]+|[a-f\d\:]+)$/i;
	return domainLike.test(input) || ipLike.test(input);
}

export function isValidPattern(value: string): boolean {
	if (typeof value !== 'string') return false;
	if (value.length < (value.startsWith('!') ? 2 : 1)) return false;
	return !/[\\\/\:]/.test(value);
}

export function isValidPort(num: number): boolean {
	return Number.isSafeInteger(num) && num >= 1 && num <= 65_535;
}
