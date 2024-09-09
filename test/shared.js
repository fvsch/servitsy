import posixPath from 'node:path/posix';

import { CLIArgs } from '../lib/args.js';
import { DIR_FILE_DEFAULT, EXTENSIONS_DEFAULT, FILE_EXCLUDE_DEFAULT } from '../lib/constants.js';
import { FileResolver } from '../lib/resolver.js';
import { trimSlash } from '../lib/utils.js';

/**
@typedef {import('../lib/types.js').FSEntryKind} FSEntryKind
@typedef {import('../lib/types.js').FSUtils} FSUtils
@typedef {import('../lib/types.js').ResolveOptions} ResolveOptions
@typedef {{path: string; kind: FSEntryKind, readable: boolean; link?: string}} VFile
**/

/** @type {ResolveOptions} */
export const defaultResolveOptions = {
	root: testPath(),
	dirFile: [...DIR_FILE_DEFAULT],
	dirList: true,
	ext: [...EXTENSIONS_DEFAULT],
	exclude: [...FILE_EXCLUDE_DEFAULT],
};

/**
 * @type {(s?: string | TemplateStringsArray, ...v: string[]) => string}
 */
export function testPath(strings = '', ...values) {
	const subpath = String.raw({ raw: strings }, ...values);
	// always use forward slashes in paths used by tests
	const filePath = posixPath.join('/tmp/servitsy-test', subpath);
	return trimSlash(filePath, { end: true });
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

class TestFS {
	/** @type {Map<string, VFile>} */
	files = new Map();

	/**
	 * @param {Record<string, boolean | string>} filePaths
	 */
	constructor(filePaths) {
		// add root dir
		this.files.set(testPath(), { path: testPath(), kind: 'dir', readable: true });

		// add dirs and files
		for (const [key, value] of Object.entries(filePaths)) {
			const relPath = trimSlash(key);

			/** @type {string[]} */
			const paths = [];
			for (const segment of relPath.split('/')) {
				const prev = paths.at(-1);
				paths.push(prev ? `${prev}/${segment}` : segment);
			}

			for (const path of paths) {
				const isDir = relPath.startsWith(`${path}/`);
				const fullPath = testPath(path);
				if (this.has(fullPath)) continue;
				this.set(fullPath, {
					path: fullPath,
					kind: isDir ? 'dir' : 'file',
					readable: isDir ? true : value !== false,
					link: typeof value === 'string' ? value : undefined,
				});
			}
		}
	}

	#trimPath(filePath = '') {
		return trimSlash(filePath, { end: true });
	}

	has(filePath = '') {
		return this.files.has(this.#trimPath(filePath));
	}

	get(filePath = '') {
		return this.files.get(this.#trimPath(filePath));
	}

	/**
	 * @param {string} filePath
	 * @param {VFile} vfile
	 */
	set(filePath = '', vfile) {
		return this.files.set(this.#trimPath(filePath), vfile);
	}
}

/**
 * @type {(filePaths: Record<string, boolean | string>) => FSUtils}
 */
export function getFsUtils(filePaths) {
	const vfs = new TestFS(filePaths);
	return {
		dirSep: posixPath.sep,
		join: posixPath.join,
		relative: posixPath.relative,
		async index(dirPath) {
			if (!vfs.has(dirPath) || vfs.get(dirPath)?.kind !== 'dir') return [];
			const prefix = `${dirPath}/`;
			const entries = [];
			for (const entry of vfs.files.values()) {
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
		async realpath(filePath) {
			const file = vfs.get(filePath);
			if (file?.kind === 'link') {
				return file.link && vfs.has(file.link) ? file.link : null;
			}
			return file ? filePath : null;
		},
	};
}

/**
 * @type {(options?: Partial<ResolveOptions>, files?: Record<string, boolean | string>) => FileResolver}
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
