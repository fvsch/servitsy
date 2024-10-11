import { release } from 'node:os';
import { env, platform } from 'node:process';
import * as util from 'node:util';

export class ColorUtils {
	/**
	 * @type {boolean}
	 */
	#enabled;

	/**
	 * @type {[string, string]}
	 */
	#brackets;

	/**
	 * @param {{ enabled?: boolean; brackets?: [string, string] }} [options]
	 */
	constructor(options) {
		this.#enabled = typeof options?.enabled === 'boolean' ? options.enabled : checkColorSupport();
		this.#brackets = Array.isArray(options?.brackets) ? options.brackets : ['[', ']'];
	}

	get enabled() {
		return this.#enabled;
	}

	/**
	 * @param {boolean} value
	 */
	set enabled(value) {
		this.#enabled = value;
	}

	/**
	 * @type {(text: string, format?: string) => string}
	 */
	style = (text, format = '') => {
		return this.#enabled ? styleText(text, format) : text;
	};

	/**
	 * @type {(text: string, format?: string) => string}
	 */
	brackets = (text, format = 'dim,,dim') => {
		return this.sequence([this.#brackets[0], text, this.#brackets[1]], format);
	};

	/**
	 * @type {(parts: string[], format?: string) => string}
	 */
	sequence = (parts, format = '') => {
		if (!format || !this.#enabled) {
			return parts.join('');
		}
		const formats = format.split(',');
		return parts
			.map((part, index) => (formats[index] ? this.style(part, formats[index]) : part))
			.join('');
	};

	/**
	 * @type {(input: string) => string}
	 */
	strip = stripStyle;
}

/**
 * @returns {boolean}
 */
function checkColorSupport() {
	const getEnv = (key = '') => env[key]?.toLowerCase() || '';

	if (typeof env['NO_COLOR'] === 'string') {
		const forceColor = getEnv('FORCE_COLOR');
		return forceColor === 'true' || /^\d$/.test(forceColor);
	}
	if (platform === 'win32') {
		// Logic borrowed from supports-color.
		// Windows 10 build 10586 is the first release that supports 256 colors.
		const [major, _, build] = release().split('.');
		return Number(major) >= 10 && Number(build) >= 10_586;
	} else {
		const term = getEnv('TERM');
		const colorterm = getEnv('COLORTERM');
		return (
			colorterm === 'truecolor' ||
			term === 'xterm-256color' ||
			term === 'xterm-16color' ||
			term === 'xterm-color'
		);
	}
}

/**
 * @param {string} text
 * @param {string} [format]
 * @returns {string}
 */
function styleText(text, format = '') {
	format = format.trim();
	if (typeof util.styleText === 'function' && format != '') {
		/** @type {any} */
		const stFormat = format.includes(' ') ? format.split(' ') : format;
		return util.styleText(stFormat, text);
	}
	return text;
}

/**
 * @param {string} input
 * @returns {string}
 */
export function stripStyle(input) {
	if (typeof input === 'string' && input.includes('\x1B[')) {
		return input.replace(/\x1B\[[0-9]+m/g, '');
	}
	return input;
}
