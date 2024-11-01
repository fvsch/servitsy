import { access, constants, lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep as dirSep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trimSlash } from './utils.js';

/**
@typedef {import('./types.d.ts').FSEntryBase} FSEntryBase
@typedef {import('./types.d.ts').FSEntryKind} FSEntryKind
@typedef {import('./types.d.ts').ErrorList} ErrorList
*/

/** @type {(dirPath: string, context?: { error: ErrorList }) => Promise<boolean>} */
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

/** @type {(dirPath: string) => Promise<FSEntryBase[]>} */
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

/** @type {(filePath: string) => Promise<FSEntryKind | null>} */
export async function getKind(filePath) {
	try {
		const stats = await lstat(filePath);
		return statsKind(stats);
	} catch (err) {
		return null;
	}
}

/** @type {(root: string, filePath: string) => string | null} */
export function getLocalPath(root, filePath) {
	if (isSubpath(root, filePath)) {
		return trimSlash(filePath.slice(root.length), { start: true, end: true });
	}
	return null;
}

/** @type {(filePath: string) => Promise<string | null>} */
export async function getRealpath(filePath) {
	try {
		const real = await realpath(filePath);
		return real;
	} catch {
		return null;
	}
}

/** @type {(filePath: string, kind?: FSEntryKind | null) => Promise<boolean>} */
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

/** @type {(parent: string, filePath: string) => boolean} */
export function isSubpath(parent, filePath) {
	if (filePath.includes('..') || !isAbsolute(filePath)) return false;
	parent = trimSlash(parent, { end: true });
	return filePath === parent || filePath.startsWith(parent + dirSep);
}

/** @type {(moduleUrl: URL | string) => string} */
export function moduleDirname(moduleUrl) {
	return fileURLToPath(new URL('.', moduleUrl));
}

/** @type {(localPath: string) => string} */
export function pkgFilePath(localPath) {
	return join(moduleDirname(import.meta.url), '..', localPath);
}

/** @type {(localPath: string) => Promise<string>} */
export async function readPkgFile(localPath) {
	return readFile(pkgFilePath(localPath), { encoding: 'utf8' });
}

/** @type {() => Promise<Record<string, any>>} */
export async function readPkgJson() {
	const raw = await readPkgFile('package.json');
	return JSON.parse(raw);
}

/** @type {(stats: import('node:fs').Dirent | import('node:fs').StatsBase<any>) => FSEntryKind | null} */
export function statsKind(stats) {
	if (stats.isSymbolicLink()) return 'link';
	if (stats.isDirectory()) return 'dir';
	else if (stats.isFile()) return 'file';
	return null;
}
