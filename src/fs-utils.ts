import { access, constants, lstat, readdir, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join, sep as dirSep } from 'node:path';

import type { FSKind, FSLocation } from './types.d.ts';
import { trimSlash } from './utils.js';

export async function checkDirAccess(
	dirPath: string,
	context: { onError(msg: string): void },
): Promise<boolean> {
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
	} catch (err: any) {
		if (err.code === 'ENOENT') {
			msg = `not a directory: ${dirPath}`;
		} else if (err.code === 'EACCES') {
			msg = `permission denied: ${dirPath}`;
		} else {
			msg = err.toString();
		}
	}
	if (msg) context.onError(msg);
	return false;
}

export async function getIndex(dirPath: string): Promise<FSLocation[]> {
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

export async function getKind(filePath: string): Promise<FSKind> {
	try {
		const stats = await lstat(filePath);
		return statsKind(stats);
	} catch (err) {
		return null;
	}
}

export function getLocalPath(root: string, filePath: string): string | null {
	if (isSubpath(root, filePath)) {
		return trimSlash(filePath.slice(root.length), { start: true, end: true });
	}
	return null;
}

/** @type {(filePath: string) => Promise<string | null>} */
export async function getRealpath(filePath: string): Promise<string | null> {
	try {
		const real = await realpath(filePath);
		return real;
	} catch {
		return null;
	}
}

export async function isReadable(filePath: string, kind?: FSKind): Promise<boolean> {
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

export function isSubpath(parent: string, filePath: string): boolean {
	if (filePath.includes('..') || !isAbsolute(filePath)) return false;
	parent = trimSlash(parent, { end: true });
	return filePath === parent || filePath.startsWith(parent + dirSep);
}

export function readPkgJson(): Record<string, any> {
	return createRequire(import.meta.url)('../package.json');
}

interface StatsLike {
	isSymbolicLink?(): boolean;
	isDirectory?(): boolean;
	isFile?(): boolean;
}

export function statsKind(stats: StatsLike): FSKind {
	if (stats.isSymbolicLink?.()) return 'link';
	if (stats.isDirectory?.()) return 'dir';
	else if (stats.isFile?.()) return 'file';
	return null;
}