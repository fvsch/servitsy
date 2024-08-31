import { join } from 'node:path';
import { cwd } from 'node:process';

import { CLIArgs } from '../lib/args.js';
import { DIR_FILE_DEFAULT, EXTENSIONS_DEFAULT, FILE_EXCLUDE_DEFAULT } from '../lib/constants.js';
import { FileResolver } from '../lib/resolver.js';

/** @type {ResolveOptions} */
export const defaultResolveOptions = {
	root: testPath(),
	dirFile: [...DIR_FILE_DEFAULT],
	dirList: true,
	ext: [...EXTENSIONS_DEFAULT],
	exclude: [...FILE_EXCLUDE_DEFAULT],
};

/**
 @typedef {{path: string; kind: 'dir' | 'file', readable: boolean}} VFile
@typedef {import('../lib/types.js').FSUtils} FSUtils
@typedef {import('../lib/types.js').ResolveOptions} ResolveOptions
**/

/**
 * @type {(s?: string | TemplateStringsArray, ...v: string[]) => string}
 */
export function testPath(strings = '', ...values) {
	const subpath = String.raw({ raw: strings }, ...values);
	return join(cwd(), 'tmp/test', subpath);
}

/**
 * @type {(s?: string | TemplateStringsArray, ...v: string[]) => CLIArgs}
 */
export function argify(strings = '', ...values) {
	return new CLIArgs(
		String.raw({ raw: strings }, ...values)
			.trim()
			.split(/\s+/g),
	);
}

/**
 * @type {(filePaths: Record<string, boolean>) => FSUtils}
 */
export function getFsUtils(filePaths) {
	/** @type {Map<string, VFile>} */
	const vfs = new Map();

	// add root dir
	vfs.set(testPath(), { path: testPath(), kind: 'dir', readable: true });

	// add dirs and files
	for (const [key, readable] of Object.entries(filePaths)) {
		const filePath = key.replace(/^\//, '').replace(/\/$/, '');

		/** @type {string[]} */
		const paths = [];
		for (const segment of filePath.split('/')) {
			const prev = paths.at(-1);
			paths.push(prev ? `${prev}/${segment}` : segment);
		}

		for (const path of paths) {
			const isDir = filePath.startsWith(`${path}/`);
			const fullPath = testPath(path);
			if (vfs.has(fullPath)) continue;
			vfs.set(fullPath, {
				path: fullPath,
				kind: isDir ? 'dir' : 'file',
				readable: isDir ? true : readable,
			});
		}
	}

	return {
		async index(dirPath) {
			if (!vfs.has(dirPath) || vfs.get(dirPath)?.kind !== 'dir') return [];
			const prefix = `${dirPath}/`;
			const entries = [];
			for (const entry of vfs.values()) {
				if (!entry.path.startsWith(prefix)) continue;
				const relative = entry.path.slice(prefix.length);
				if (!relative.includes('/')) {
					entries.push({ filePath: entry.path, kind: entry.kind });
				}
			}
			return entries;
		},
		async info(filePath) {
			const kind = await this.kind(filePath);
			const readable = await this.readable(filePath);
			return { filePath, kind, readable };
		},
		async kind(filePath) {
			return vfs.get(filePath)?.kind ?? null;
		},
		async readable(filePath) {
			return vfs.get(filePath)?.readable ?? false;
		},
	};
}

/**
 * @type {(options?: Partial<ResolveOptions>, files?: Record<string, boolean>) => FileResolver}
 */
export function getResolver(options = {}, files = {}) {
	return new FileResolver(
		{
			root: options.root ?? testPath(),
			...options,
		},
		getFsUtils(files),
	);
}
