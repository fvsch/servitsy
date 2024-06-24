import { access, constants, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * @type {import('./resolver.js').FSUtils}
 */
export const fsUtils = {
	async index(dirPath) {
		try {
			const entries = await readdir(dirPath, { withFileTypes: true });
			return entries.map((entry) => ({
				filePath: join(entry.parentPath, entry.name),
				kind: entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : null,
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
			const stats = await stat(filePath);
			if (stats.isDirectory()) return 'dir';
			if (stats.isFile()) return 'file';
		} catch (err) {}
		return null;
	},
	async readable(filePath, kind) {
		if (kind === undefined) {
			kind = await this.kind(filePath);
		}
		if (typeof kind !== 'string') {
			return false;
		}
		return access(filePath, kind === 'dir' ? constants.R_OK | constants.X_OK : constants.R_OK).then(
			() => true,
			() => false,
		);
	},
};

/**
 * @param {string} file
 */
export function readAsset(file) {
	return readFile(join(import.meta.dirname, 'assets', file), { encoding: 'utf-8' });
}
