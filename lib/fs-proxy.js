import { access, constants, lstat, open, readdir, readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, sep as dirSep } from 'node:path';

import { getDirname } from './utils.js';

/**
 * @type {import('./types.js').FSProxy}
 */
export const fsProxy = {
	dirSep,
	join,
	async index(dirPath) {
		try {
			const entries = await readdir(dirPath, { withFileTypes: true });
			return entries.map((entry) => ({
				filePath: join(entry.parentPath, entry.name),
				kind: statsKind(entry),
			}));
		} catch {
			return [];
		}
	},
	async info(filePath) {
		const kind = await this.kind(filePath);
		const readable = await this.readable(filePath, kind);
		return { filePath, readable, kind };
	},
	async kind(filePath) {
		try {
			const stats = await lstat(filePath);
			return statsKind(stats);
		} catch (err) {
			return null;
		}
	},
	async open(filePath) {
		return open(filePath);
	},
	async readable(filePath, kind) {
		if (kind === undefined) {
			kind = await this.kind(filePath);
		}
		if (kind === 'dir' || kind === 'file') {
			const mode = kind === 'dir' ? constants.R_OK | constants.X_OK : constants.R_OK;
			return access(filePath, mode).then(
				() => true,
				() => false,
			);
		}
		return false;
	},
	async readFile(filePath) {
		return readFile(filePath);
	},
	async realpath(filePath) {
		try {
			const real = await realpath(filePath);
			return real;
		} catch {
			return null;
		}
	},
};

/**
 * @param {import('node:fs').Dirent | import('node:fs').StatsBase<any>} stats
 * @returns {import('./types.js').FSEntryKind | null}
 */
export function statsKind(stats) {
	if (stats.isSymbolicLink()) return 'link';
	if (stats.isDirectory()) return 'dir';
	else if (stats.isFile()) return 'file';
	return null;
}

/**
 * @returns {{ version: string }}
 */
export function readPkgJson() {
	return createRequire(import.meta.url)('../package.json');
}

/**
 * @param {string} localPath
 * @param {NodeJS.BufferEncoding} [encoding]
 * @returns {Promise<string | import('node:buffer').Buffer>}
 */
export async function readPkgFile(localPath, encoding = 'utf8') {
	const fullPath = join(getDirname(import.meta.url), '..', localPath);
	return readFile(fullPath, { encoding });
}
