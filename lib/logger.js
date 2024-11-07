import { release } from 'node:os';
import { platform } from 'node:process';
import { stderr, stdout } from 'node:process';
import { inspect } from 'node:util';

import { clamp, fwdSlash, getEnv, trimSlash, withResolvers } from './utils.js';

/**
@typedef {import('./types.d.ts').ResMetaData} ResMetaData
@typedef {{
	group: 'header' | 'info' | 'request' | 'error';
	text: string;
	padding: {top: number; bottom: number};
}} LogItem
*/

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

class Logger {
	/** @type {LogItem | null} */
	#lastout = null;
	/** @type {LogItem | null} */
	#lasterr = null;

	/**
	@type {(prev: LogItem | null, next: LogItem) => string}
	*/
	#withPadding(prev, { group, text, padding }) {
		const maxPad = 4;
		let start = '';
		let end = '';
		if (padding.top) {
			const count = padding.top - (prev?.padding.bottom ?? 0);
			start = '\n'.repeat(clamp(count, 0, maxPad));
		} else if (prev && !prev.padding.bottom && prev.group !== group) {
			start = '\n';
		}
		if (padding.bottom) {
			end = '\n'.repeat(clamp(padding.bottom, 0, maxPad));
		}
		return `${start}${text}\n${end}`;
	}

	/**
	@type {(group: LogItem['group'], data: string | string[], padding?: LogItem['padding']) => Promise<void>}
	*/
	async write(group, data = '', padding = { top: 0, bottom: 0 }) {
		const item = {
			group,
			text: Array.isArray(data) ? data.join('\n') : data,
			padding,
		};
		if (item.text.trim() === '') {
			return;
		}

		const { promise, resolve, reject } = withResolvers();
		const writeCallback = (/** @type {Error|undefined} */ err) => {
			if (err) reject(err);
			else resolve();
		};

		if (group === 'error') {
			stderr.write(this.#withPadding(this.#lasterr, item), writeCallback);
			this.#lasterr = item;
		} else {
			stdout.write(this.#withPadding(this.#lastout, item), writeCallback);
			this.#lastout = item;
		}

		return promise;
	}

	/**
	@type {(...errors: Array<string | Error>) => void}
	*/
	error(...errors) {
		this.write(
			'error',
			errors.map((error) => {
				if (typeof error === 'string') return `servitsy: ${error}`;
				else return inspect(error, { colors: color.enabled });
			}),
		);
	}
}

/** @type {(data: import('./types.d.ts').ResMetaData) => string} */
export function requestLogLine({ status, method, urlPath, localPath, timing, error }) {
	const { start, close } = timing;
	const { style: _, brackets } = color;

	const isSuccess = status >= 200 && status < 300;
	const timestamp = start ? new Date(start).toTimeString().split(' ')[0]?.padStart(8) : undefined;
	const duration = start && close ? Math.ceil(close - start) : undefined;

	let displayPath = _(urlPath, 'cyan');
	if (isSuccess && localPath != null) {
		const basePath = urlPath.length > 1 ? trimSlash(urlPath, { end: true }) : urlPath;
		const suffix = pathSuffix(basePath, `/${fwdSlash(localPath)}`);
		if (suffix) {
			displayPath = _(basePath, 'cyan') + brackets(suffix, 'dim,gray,dim');
			if (urlPath.length > 1 && urlPath.endsWith('/')) displayPath += _('/', 'cyan');
		}
	}

	const line = [
		timestamp && _(timestamp, 'dim'),
		_(`${status}`, isSuccess ? 'green' : 'red'),
		_('—', 'dim'),
		_(method, 'cyan'),
		displayPath,
		duration && _(`(${duration}ms)`, 'dim'),
	]
		.filter((s) => typeof s === 'string' && s !== '')
		.join(' ');

	if (!isSuccess && error) {
		return `${line}\n${_(error.toString(), 'red')}`;
	}
	return line;
}

/** @type {(basePath: string, fullPath: string) => string | undefined} */
function pathSuffix(basePath, fullPath) {
	if (basePath === fullPath) {
		return '';
	} else if (fullPath.startsWith(basePath)) {
		return fullPath.slice(basePath.length);
	}
}

/** @type {(input: string) => string} */
export function stripStyle(input) {
	if (typeof input === 'string' && input.includes('\x1b[')) {
		return input.replace(/\x1b\[\d+m/g, '');
	}
	return input;
}

/**
Basic implementation of 'node:util' styleText to support Node 18 + Deno.
@type {(format: string | string[], text: string) => string}
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

/** @type {() => boolean} */
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

export const color = new ColorUtils(supportsColor());
export const logger = new Logger();
