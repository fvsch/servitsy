import { access, constants, lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
@typedef {import('./types.js').FSEntryBase} FSEntryBase
@typedef {import('./types.js').FSEntryKind} FSEntryKind
**/

/**
 * @type {(moduleUrl: URL | string) => string}
 */
export function moduleDirname(moduleUrl) {
	return fileURLToPath(new URL('.', moduleUrl));
}

/**
 * @param {string} dirPath
 * @returns {Promise<FSEntryBase[]>}
 */
export async function getIndex(dirPath) {
	try {
		const entries = await readdir(dirPath, { withFileTypes: true });
		return entries.map((entry) => ({
			filePath: join(entry.parentPath, entry.name),
			kind: statsKind(entry),
		}));
	} catch {
		return [];
	}
}

/**
 * @param {string} filePath
 * @returns {Promise<FSEntryKind | null>}
 */
export async function getKind(filePath) {
	try {
		const stats = await lstat(filePath);
		return statsKind(stats);
	} catch (err) {
		return null;
	}
}

/**
 * @param {string} filePath
 * @returns {Promise<string | null>}
 */
export async function getRealpath(filePath) {
	try {
		const real = await realpath(filePath);
		return real;
	} catch {
		return null;
	}
}

/**
 * @param {string} filePath
 * @param {FSEntryKind | null} [kind]
 */
export async function isReadable(filePath, kind) {
	if (kind === undefined) {
		kind = await getKind(filePath);
	}
	if (kind === 'dir' || kind === 'file' || kind === 'link') {
		const mode = kind === 'dir' ? constants.R_OK | constants.X_OK : constants.R_OK;
		return access(filePath, mode).then(
			() => true,
			() => false,
		);
	}
	return false;
}

/**
 * @param {string} localPath
 * @returns {Promise<string>}
 */
export async function readPkgFile(localPath) {
	const fullPath = join(moduleDirname(import.meta.url), '..', localPath);
	return readFile(fullPath, { encoding: 'utf8' });
}

/**
 * @returns {Promise<Record<string, any>>}
 */
export async function readPkgJson() {
	const raw = await readPkgFile('package.json');
	return JSON.parse(raw);
}

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
