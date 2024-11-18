import { release } from 'node:os';
import { platform } from 'node:process';
import { stderr, stdout } from 'node:process';
import { inspect } from 'node:util';

import type { ResMetaData } from './types.d.ts';
import { clamp, fwdSlash, getEnv, getRuntime, trimSlash, withResolvers } from './utils.js';

interface LogItem {
	group: 'header' | 'info' | 'request' | 'error';
	text: string;
	padding: { top: number; bottom: number };
}

export class ColorUtils {
	enabled: boolean;

	constructor(colorEnabled?: boolean) {
		this.enabled = typeof colorEnabled === 'boolean' ? colorEnabled : true;
	}

	brackets = (
		text: string,
		format: string = 'dim,,dim',
		chars: [string, string] = ['[', ']'],
	): string => {
		return this.sequence([chars[0], text, chars[1]], format);
	};

	sequence = (parts: string[], format: string = ''): string => {
		if (!format || !this.enabled) {
			return parts.join('');
		}
		const formats = format.split(',');
		return parts
			.map((part, index) => (formats[index] ? this.style(part, formats[index]) : part))
			.join('');
	};

	style = (text: string, format: string = ''): string => {
		if (!this.enabled) return text;
		return styleText(format.trim().split(/\s+/g), text);
	};
}

class Logger {
	#lastout?: LogItem;
	#lasterr?: LogItem;

	async write(
		group: LogItem['group'],
		data: string | string[] = '',
		padding: LogItem['padding'] = { top: 0, bottom: 0 },
	) {
		const item = {
			group,
			text: Array.isArray(data) ? data.join('\n') : data,
			padding,
		};
		if (item.text.trim() === '') {
			return;
		}

		const { promise, resolve, reject } = withResolvers<void>();
		const writeCallback = (err: Error | undefined) => {
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

	error(...errors: Array<string | Error>) {
		return this.write(
			'error',
			errors.map((error) => {
				if (typeof error === 'string') return `servitsy: ${error}`;
				else return inspect(error, { colors: color.enabled });
			}),
		);
	}

	#withPadding(prev: LogItem | undefined, item: LogItem): string {
		const maxPad = 4;
		let start = '';
		let end = '';
		if (item.padding.top) {
			const count = item.padding.top - (prev?.padding.bottom ?? 0);
			start = '\n'.repeat(clamp(count, 0, maxPad));
		} else if (prev && !prev.padding.bottom && prev.group !== item.group) {
			start = '\n';
		}
		if (item.padding.bottom) {
			end = '\n'.repeat(clamp(item.padding.bottom, 0, maxPad));
		}
		return `${start}${item.text}\n${end}`;
	}
}

export function requestLogLine({
	status,
	method,
	url,
	urlPath,
	localPath,
	timing,
	error,
}: ResMetaData): string {
	const { start, close } = timing;
	const { style: _, brackets } = color;

	const isSuccess = status >= 200 && status < 300;
	const timestamp = start ? new Date(start).toTimeString().split(' ')[0]?.padStart(8) : undefined;
	const duration = start && close ? Math.ceil(close - start) : undefined;

	let displayPath = _(urlPath ?? url, 'cyan');
	if (isSuccess && urlPath != null && localPath != null) {
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

function pathSuffix(basePath: string, fullPath: string): string | undefined {
	if (basePath === fullPath) {
		return '';
	} else if (fullPath.startsWith(basePath)) {
		return fullPath.slice(basePath.length);
	}
}

/**
Basic implementation of 'node:util' styleText to support Node 18 + Deno.
*/
export function styleText(format: string | string[], text: string): string {
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

function supportsColor(): boolean {
	// Avoid reading env variables in Deno to limit prompts;
	// instead rely on its built-in parsing of the NO_COLOR env variable
	if (getRuntime() === 'deno') {
		return (globalThis as any).Deno?.noColor !== true;
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