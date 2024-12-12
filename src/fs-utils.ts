import { access, constants, lstat, readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { FSKind, FSLocation } from './types.d.ts';

export async function checkDirAccess(
	dirPath: string,
	onError?: (msg: string) => void,
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
	if (msg && onError) {
		onError(msg);
	}
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
	} catch {
		return null;
	}
}

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

function statsKind(stats: {
	isSymbolicLink?(): boolean;
	isDirectory?(): boolean;
	isFile?(): boolean;
}): FSKind {
	if (stats.isSymbolicLink?.()) return 'link';
	if (stats.isDirectory?.()) return 'dir';
	else if (stats.isFile?.()) return 'file';
	return null;
}
