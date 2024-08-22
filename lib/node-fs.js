import { access, constants, readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const pkgRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * @type {Record<string, string>}
 */
const assetCache = {};

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
 * @returns {Promise<string>}
 */
export async function readAsset(file) {
	if (typeof assetCache[file] !== 'string') {
		assetCache[file] = await readFile(join(pkgRoot, 'lib', 'assets', file), { encoding: 'utf-8' });
	}
	return assetCache[file];
}

/**
 * @returns {{ version: string }}
 */
export function readPkgJson() {
	return createRequire(pkgRoot)('./package.json');
}
