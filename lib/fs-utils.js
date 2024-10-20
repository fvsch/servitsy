import { access, constants, lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
@typedef {import('./types.d.ts').FSEntryBase} FSEntryBase
@typedef {import('./types.d.ts').FSEntryKind} FSEntryKind
@typedef {import('./types.d.ts').ErrorList} ErrorList
**/

/**
 * @param {string} dirPath
 * @param {{ error: ErrorList }} [context]
 * @returns {Promise<boolean>}
 */
export async function checkDirAccess(dirPath, context) {
	let msg = '';
	try {
		const stats = await stat(dirPath);
		if (stats.isDirectory()) {
			// needs r-x permissions to access contents of the directory
			await access(dirPath, constants.R_OK | constants.X_OK);
			return true;
		} else {
			msg = `not a directory: ${dirPath}`;
		}
	} catch (/** @type {any} */ err) {
		if (err.code === 'ENOENT') {
			msg = `not a directory: ${dirPath}`;
		} else if (err.code === 'EACCES') {
			msg = `permission denied: ${dirPath}`;
		} else {
			msg = err.toString();
		}
	}
	if (msg) context?.error(msg);
	return false;
}

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
 * @returns {string}
 */
export function pkgFilePath(localPath) {
	return join(moduleDirname(import.meta.url), '..', localPath);
}

/**
 * @param {string} localPath
 * @returns {Promise<string>}
 */
export async function readPkgFile(localPath) {
	return readFile(pkgFilePath(localPath), { encoding: 'utf8' });
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
 * @returns {FSEntryKind | null}
 */
export function statsKind(stats) {
	if (stats.isSymbolicLink()) return 'link';
	if (stats.isDirectory()) return 'dir';
	else if (stats.isFile()) return 'file';
	return null;
}
