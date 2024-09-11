import { access, constants, lstat, readdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, relative, sep as dirSep } from 'node:path';

/**
 * @type {import('./types.js').FSUtils}
 */
export const fsUtils = {
	dirSep,
	join,
	relative,
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
 * @returns {import('./types.js').FSEntryKind}
 */
function statsKind(stats) {
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
