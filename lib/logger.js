import { stderr, stdout } from 'node:process';
import { inspect } from 'node:util';

import { color, clamp, fwdSlash, withResolvers, trimSlash } from './utils.js';

/**
@typedef {import('./types.js').ErrorMessage} ErrorMessage
@typedef {import('./types.js').ReqResMeta} ReqResMeta

@typedef {{
	group: 'header' | 'info' | 'request' | 'error';
	text: string;
	padding: {top: number; bottom: number};
}} LogItem
**/

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
	 * @returns {Promise<void>}
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
	 * @param {Error} error
	 */
	writeErrorObj(error) {
		this.write('error', inspect(error, { colors: color.enabled }));
	}
}

export const logger = new Logger();

/**
 * @param {ReqResMeta} data
 * @returns {string}
 */
export function requestLogLine({ startedAt, endedAt, status, method, urlPath, file, error }) {
	const { brackets, style } = color;

	const isSuccess = status >= 200 && status < 300;
	const timestamp = new Date(endedAt ?? startedAt).toTimeString().split(' ')[0]?.padStart(8);

	let displayPath = style(urlPath, 'cyan');
	if (isSuccess && file?.localPath) {
		const basePath = urlPath.length > 1 ? trimSlash(urlPath, { end: true }) : urlPath;
		const suffix = pathSuffix(basePath, `/${fwdSlash(file.localPath)}`);
		if (suffix) {
			displayPath = style(basePath, 'cyan') + brackets(suffix, 'dim,gray,dim');
			if (urlPath.length > 1 && urlPath.endsWith('/')) displayPath += style('/', 'cyan');
		}
	}

	const line = [
		style(timestamp, 'dim'),
		style(`${status}`, isSuccess ? 'green' : 'red'),
		style('—', 'dim'),
		style(method, 'cyan'),
		displayPath,
	].join(' ');

	if (!isSuccess && error) {
		return `${line}\n${style(error.toString(), 'red')}`;
	}
	return line;
}

/**
 * @param {string} basePath
 * @param {string} fullPath
 * @returns {string | undefined}
 */
function pathSuffix(basePath, fullPath) {
	if (basePath === fullPath) {
		return '';
	} else if (fullPath.startsWith(basePath)) {
		return fullPath.slice(basePath.length);
	}
}
