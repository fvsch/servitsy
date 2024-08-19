import { relative } from 'node:path';
import { stderr, stdout } from 'node:process';

import { clamp, fwdPath } from './utils.js';

/**
@typedef {{ error?: string; warn?: string }} ErrorMessage

@typedef {{
  errors: ErrorMessage[];
  error: (msg: string) => void;
  warn: (msg: string) => void;
}} ErrorsContext

@typedef {{
	group: 'header' | 'info' | 'request' | 'error';
	text: string;
	padding: {top: number; bottom: number};
}} LogItem
**/

/**
 * @type {() => ErrorsContext}
 */
export function errorsContext() {
	/** @type {ErrorMessage[]} */
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

class Logger {
	/** @type {LogItem | null} */
	#lastout = null;
	/** @type {LogItem | null} */
	#lasterr = null;

	/**
	 * @param {LogItem | null} prev
	 * @param {LogItem} next
	 * @returns {string}
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
	 * @param {LogItem['group']} group
	 * @param {string | string[]} [data]
	 * @param {LogItem['padding']} [padding]
	 */
	write(group, data = '', padding = { top: 0, bottom: 0 }) {
		const item = {
			group,
			text: Array.isArray(data) ? data.join('\n') : data,
			padding,
		};
		if (item.text.trim() === '') {
			return;
		}

		if (group === 'error') {
			stderr.write(this.#withPadding(this.#lasterr, item));
			this.#lasterr = item;
		} else {
			stdout.write(this.#withPadding(this.#lastout, item));
			this.#lastout = item;
		}
	}

	/**
	 * @param {ErrorMessage | ErrorMessage[]} errors
	 */
	writeErrors(errors) {
		const sorted = [errors].flat().sort((a, b) => (a.warn && b.error ? -1 : 1));
		this.write(
			'error',
			sorted.map((err) => `servitsy: ${err.warn ?? err.error}`),
		);
	}

	/**
	 * @param {import('./server.js').ReqResInfo} info
	 */
	writeRequest(info) {
		this.write('request', requestLogLine(info));
	}
}

export const logger = new Logger();

/**
 * @param {import('./server.js').ReqResInfo} info
 */
export function requestLogLine({ root, filePath, method, status, urlPath }) {
	let line = `[${status}] ${method} ${urlPath}`;

	const isSuccess = status >= 200 && status < 300;
	const fileUrlPath = filePath ? '/' + fwdPath(relative(root, filePath)) : undefined;

	if (isSuccess && fileUrlPath && fileUrlPath != '/') {
		const hasSuffix = fileUrlPath.startsWith(urlPath) && !fileUrlPath.endsWith(urlPath);
		const suffix = hasSuffix
			? fileUrlPath.slice(fileUrlPath.lastIndexOf(urlPath) + urlPath.length)
			: '';
		if (suffix.length > 1) line += `<${suffix}>`;
	}

	return line;
}
