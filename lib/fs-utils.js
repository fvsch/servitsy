import { access, constants, lstat, readdir, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join, sep as dirSep } from 'node:path';

import { trimSlash } from './utils.js';

/**
@typedef {import('./types.d.ts').FSKind} FSKind
@typedef {import('./types.d.ts').FSLocation} FSLocation
*/

/** @type {(dirPath: string, context: { onError(msg: string): void }) => Promise<boolean>} */
export async function checkDirAccess(dirPath, { onError }) {
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
	if (msg) onError(msg);
	return false;
}

/** @type {(dirPath: string) => Promise<FSLocation[]>} */
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

/** @type {(filePath: string) => Promise<FSKind>} */
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

/** @type {(filePath: string, kind?: FSKind) => Promise<boolean>} */
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

/** @type {() => Record<string, any>} */
export function readPkgJson() {
	return createRequire(import.meta.url)('../package.json');
}

/** @type {(stats: {isSymbolicLink?(): boolean; isDirectory?(): boolean; isFile?(): boolean}) => FSKind} */
export function statsKind(stats) {
	if (stats.isSymbolicLink?.()) return 'link';
	if (stats.isDirectory?.()) return 'dir';
	else if (stats.isFile?.()) return 'file';
	return null;
}
