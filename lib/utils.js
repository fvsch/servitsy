import { release } from 'node:os';
import { env, platform, versions } from 'node:process';
import { inspect } from 'node:util';

/**
 * @type {(value: number, min: number, max: number) => number}
 */
export function clamp(value, min, max) {
	if (typeof value !== 'number') value = min;
	return Math.min(max, Math.max(min, value));
}

export class ColorUtils {
	/** @param {boolean} [colorEnabled] */
	constructor(colorEnabled) {
		this.enabled = typeof colorEnabled === 'boolean' ? colorEnabled : true;
	}

	/** @type {(text: string, format?: string) => string} */
	style = (text, format = '') => {
		if (!this.enabled) return text;
		return styleText(format.trim().split(/\s+/g), text);
	};

	/** @type {(text: string, format?: string, chars?: [string, string]) => string} */
	brackets = (text, format = 'dim,,dim', chars = ['[', ']']) => {
		return this.sequence([chars[0], text, chars[1]], format);
	};

	/** @type {(parts: string[], format?: string) => string} */
	sequence = (parts, format = '') => {
		if (!format || !this.enabled) {
			return parts.join('');
		}
		const formats = format.split(',');
		return parts
			.map((part, index) => (formats[index] ? this.style(part, formats[index]) : part))
			.join('');
	};

	/** @type {(input: string) => string} */
	strip = stripStyle;
}

export const color = new ColorUtils(supportsColor());

/**
 * @type {(input: string, context?: 'text' | 'attr') => string}
 */
export function escapeHtml(input, context = 'text') {
	if (typeof input !== 'string') return '';
	let result = input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
	if (context === 'attr') result = result.replaceAll(`"`, '&quot;').replaceAll(`'`, '&apos;');
	return result;
}

/**
 * @typedef {{
 * 	errors: import('./types.js').ErrorMessage[];
 * 	error: (msg: string) => void;
 * 	warn: (msg: string) => void;
 * }} ErrorsContext
 * @returns {ErrorsContext}
 */
export function errorsContext() {
	/** @type {import('./types.js').ErrorMessage[]} */
	const errors = [];
	return {
		errors,
		error(msg = '') {
			errors.push({ error: msg });
		},
		warn(msg = '') {
			errors.push({ warn: msg });
		},
	};
}

/**
 * @type {(input: string) => string}
 */
export function fwdSlash(input = '') {
	return input.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

/**
 * @type {(key: string) => string}
 */
export function getEnv(key) {
	return env[key] ?? '';
}

/**
 * @returns {'bun' | 'deno' | 'node' | 'webcontainer'}
 */
export function getRuntime() {
	if (versions.bun && globalThis.Bun) return 'bun';
	if (versions.deno && globalThis.Deno) return 'deno';
	if (versions.webcontainer && getEnv('SHELL').endsWith('/jsh')) return 'webcontainer';
	return 'node';
}

/**
 * @param {string} name
 * @returns {string}
 */
export function headerCase(name) {
	return name.replace(/((^|\b|_)[a-z])/g, (s) => s.toUpperCase());
}

/**
 * @type {(address: string) => boolean}
 */
export function isPrivateIPv4(address = '') {
	const bytes = address.split('.').map(Number);
	if (bytes.length !== 4) return false;
	for (const byte of bytes) {
		if (!(byte >= 0 && byte <= 255)) return false;
	}
	return (
		// 10/8
		bytes[0] === 10 ||
		// 172.16/12
		(bytes[0] === 172 && bytes[1] >= 16 && bytes[1] < 32) ||
		// 192.168/16
		(bytes[0] === 192 && bytes[1] === 168)
	);
}

/**
 * @type {(start: number, end: number, limit?: number) => number[]}
 */
export function intRange(start, end, limit) {
	if (typeof limit === 'number') {
		if (limit < 0 || isNaN(limit)) throw new Error('Invalid limit: ' + limit);
		limit = Math.floor(limit);
	}
	start = Math.floor(start);
	end = Math.floor(end);
	const sign = start < end ? 1 : -1;
	const length = Math.abs(end - start) + 1;
	return Array(
		typeof limit === 'number' && limit >= 0 ? Math.min(length, Math.floor(limit)) : length,
	)
		.fill(undefined)
		.map((_, i) => start + i * sign);
}

/**
 * @param {string} input
 * @returns {string}
 */
export function stripStyle(input) {
	if (typeof input === 'string' && input.includes('\x1b[')) {
		return input.replace(/\x1b\[\d+m/g, '');
	}
	return input;
}

/**
 * Basic implementation of 'node:util' styleText to support Node 18 + Deno.
 * @param {string | string[]} format
 * @param {string} text
 * @returns {string}
 */
export function styleText(format, text) {
	let before = '';
	let after = '';
	for (const style of Array.isArray(format) ? format : [format]) {
		const codes = inspect.colors[style.trim()];
		if (!codes) continue;
		before = `${before}\x1b[${codes[0]}m`;
		after = `\x1b[${codes[1]}m${after}`;
	}
	return `${before}${text}${after}`;
}

/**
 * @returns {boolean}
 */
function supportsColor() {
	if (typeof globalThis.Deno?.noColor === 'boolean') {
		return !globalThis.Deno.noColor;
	}

	if (getEnv('NO_COLOR')) {
		const forceColor = getEnv('FORCE_COLOR');
		return forceColor === 'true' || /^\d$/.test(forceColor);
	}

	// Logic borrowed from supports-color.
	// Windows 10 build 10586 is the first release that supports 256 colors.
	if (platform === 'win32') {
		const [major, _, build] = release().split('.');
		return Number(major) >= 10 && Number(build) >= 10_586;
	}

	// Should work in *nix terminals.
	const term = getEnv('TERM');
	const colorterm = getEnv('COLORTERM');
	return (
		colorterm === 'truecolor' ||
		term === 'xterm-256color' ||
		term === 'xterm-16color' ||
		term === 'xterm-color'
	);
}

/**
 * @type {(input: string, options?: { start?: boolean; end?: boolean }) => string}
 */
export function trimSlash(input = '', { start, end } = { start: true, end: true }) {
	if (start === true) input = input.replace(/^[\/\\]/, '');
	if (end === true) input = input.replace(/[\/\\]$/, '');
	return input;
}

export function withResolvers() {
	/** @type {{ resolve: (value?: any) => void; reject: (reason?: any) => void }} */
	const resolvers = {
		resolve: () => {},
		reject: () => {},
	};
	const promise = new Promise((resolve, reject) => {
		resolvers.resolve = resolve;
		resolvers.reject = reject;
	});
	return { promise, ...resolvers };
}
