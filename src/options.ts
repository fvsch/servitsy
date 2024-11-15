import { isAbsolute, resolve } from 'node:path';

import { DEFAULT_OPTIONS, PORTS_CONFIG } from './constants.js';
import type { HttpHeaderRule, ServerOptions } from './types.d.ts';

export class OptionsValidator {
	onError?: (msg: string) => void;

	constructor(onError?: (msg: string) => void) {
		this.onError = onError;
	}

	#array<T = string>(input: T[] | undefined, filterFn: (item: T) => boolean): T[] | undefined {
		if (!Array.isArray(input)) return;
		if (input.length === 0) return input;
		const value = input.filter(filterFn);
		if (value.length) return value;
	}

	#bool(optName: string, input?: boolean): boolean | undefined {
		if (typeof input === 'undefined') return;
		if (typeof input === 'boolean') return input;
		else this.#error(`invalid ${optName} value: '${input}'`);
	}

	#error(msg: string) {
		this.onError?.(msg);
	}

	cors(input?: boolean): boolean | undefined {
		return this.#bool('cors', input);
	}

	dirFile(input?: string[]): string[] | undefined {
		return this.#array(input, (item) => {
			const ok = isValidPattern(item);
			if (!ok) this.#error(`invalid dirFile value: '${item}'`);
			return ok;
		});
	}

	dirList(input?: boolean): boolean | undefined {
		return this.#bool('dirList', input);
	}

	exclude(input?: string[]): string[] | undefined {
		return this.#array(input, (item) => {
			const ok = isValidPattern(item);
			if (!ok) this.#error(`invalid exclude pattern: '${item}'`);
			return ok;
		});
	}

	ext(input?: string[]): string[] | undefined {
		return this.#array(input, (item) => {
			const ok = isValidExt(item);
			if (!ok) this.#error(`invalid ext value: '${item}'`);
			return ok;
		});
	}

	gzip(input?: boolean): boolean | undefined {
		return this.#bool('gzip', input);
	}

	headers(input?: HttpHeaderRule[]): HttpHeaderRule[] | undefined {
		return this.#array(input, (rule) => {
			const ok = isValidHeaderRule(rule);
			if (!ok) this.#error(`invalid header value: ${JSON.stringify(rule)}`);
			return ok;
		});
	}

	host(input?: string): string | undefined {
		if (typeof input !== 'string') return;
		if (isValidHost(input)) return input;
		else this.#error(`invalid host value: '${input}'`);
	}

	ports(input?: number[]): number[] | undefined {
		if (!Array.isArray(input) || input.length === 0) return;
		const value = input.slice(0, PORTS_CONFIG.maxCount);
		const invalid = value.find((num) => !isValidPort(num));
		if (typeof invalid === 'undefined') return value;
		else this.#error(`invalid port number: '${invalid}'`);
	}

	root(input?: string): string {
		const value = typeof input === 'string' ? input : '';
		return isAbsolute(value) ? value : resolve(value);
	}
}

export function isStringArray(input: unknown): input is string[] {
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

/**
Checking that all characters are valid for a domain or ip,
as a usability nicety to catch obvious errors
*/
export function isValidHost(input: string): boolean {
	if (typeof input !== 'string' || !input.length) return false;
	const domainLike = /^([a-z\d\-]+)(\.[a-z\d\-]+)*$/i;
	const ipLike = /^([\d\.]+|[a-f\d\:]+)$/i;
	return domainLike.test(input) || ipLike.test(input);
}

export function isValidPattern(value: string): boolean {
	return typeof value === 'string' && value.length > 0 && !/[\\\/\:]/.test(value);
}

export function isValidPort(num: number): boolean {
	return Number.isSafeInteger(num) && num >= 1 && num <= 65_535;
}

export function serverOptions(
	options: { root: string } & Partial<ServerOptions>,
	context: { onError(msg: string): void },
): ServerOptions {
	const validator = new OptionsValidator(context?.onError);

	const checked: Partial<ServerOptions> = {
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
			// @ts-ignore
			final[key] = value;
		}
	}

	return final;
}
