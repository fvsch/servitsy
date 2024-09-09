import { env, platform } from 'node:process';
import { release } from 'node:os';
import * as util from 'node:util';

/**
 * @type {() => boolean}
 */
export const colorEnabled = (function () {
	/** @type {boolean | undefined} */
	let enabled;

	const getEnv = (key = '') => env[key]?.toLowerCase() || '';

	const checkSupport = () => {
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
	};

	return () => {
		return (enabled ??= checkSupport());
	};
})();

/**
 * @type {((text: string, format?: string, forceColor?: boolean) => string)}
 */
export function style(text, format = '', forceColor = false) {
	const useColor = forceColor || colorEnabled();
	format = format.trim();
	if (useColor && typeof util.styleText === 'function' && format != '') {
		/** @type {any} */
		const stFormat = format.includes(' ') ? format.split(' ') : format;
		return util.styleText(stFormat, text);
	}
	return text;
}

/**
 * @param {string[]} parts
 * @param {string} [format]
 * @returns {string}
 */
export function seqStyle(parts, format = '') {
	if (!format) return parts.join('');
	const formats = format.split(',');
	return parts.map((part, index) => (formats[index] ? style(part, formats[index]) : part)).join('');
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

export function brackets(text = '', format = 'dim,,dim') {
	return seqStyle(['[', text, ']'], format);
}
