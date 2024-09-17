import { Buffer } from 'node:buffer';
import posixPath from 'node:path/posix';
import { memfs } from 'memfs';

import { CLIArgs } from '../lib/args.js';
import { DIR_FILE_DEFAULT, EXTENSIONS_DEFAULT, FILE_EXCLUDE_DEFAULT } from '../lib/constants.js';
import { statsKind } from '../lib/fs-proxy.js';
import { FileResolver } from '../lib/resolver.js';
import { trimSlash } from '../lib/utils.js';

/**
@typedef {import('../lib/types.js').DirIndexItem} DirIndexItem
@typedef {import('../lib/types.js').FSEntryKind} FSEntryKind
@typedef {import('../lib/types.js').FSProxy} FSProxy
@typedef {import('../lib/types.js').ResolvedFile} ResolvedFile
@typedef {import('../lib/types.js').ServerOptions} ServerOptions
@typedef {{path: string; kind: FSEntryKind, readable: boolean; link?: string}} VFile
**/

/** @type {ServerOptions} */
export const blankOptions = {
	root: root(),
	dirFile: [],
	dirList: false,
	ext: [],
	exclude: [],
	cors: false,
	headers: [],
};

/** @type {ServerOptions} */
export const defaultOptions = {
	root: root(),
	dirFile: [...DIR_FILE_DEFAULT],
	dirList: true,
	ext: [...EXTENSIONS_DEFAULT],
	exclude: [...FILE_EXCLUDE_DEFAULT],
	cors: false,
	headers: [],
};

/**
 * @type {(s?: string | TemplateStringsArray, ...v: string[]) => string}
 */
export function root(strings = '', ...values) {
	const subpath = String.raw({ raw: strings }, ...values);
	// always use forward slashes in paths used by tests
	const filePath = posixPath.join('/tmp/servitsy-test', subpath);
	return trimSlash(filePath, { end: true });
}

/**
 * @type {(localPath: string, kind?: FSEntryKind) => ResolvedFile}
 */
export function file(localPath, kind = 'file') {
	return { filePath: root(localPath), localPath, kind };
}

/**
 * @type {(localPath: string, target: ResolvedFile) => DirIndexItem}
 */
export function link(localPath, target) {
	/** @type {DirIndexItem} */
	const item = file(localPath, 'link');
	item.target = target;
	return item;
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
 * @type {(options?: Partial<ServerOptions>, files?: Record<string, boolean | string | Buffer>) => FileResolver}
 */
export function getResolver(options = {}, files = {}) {
	return new FileResolver(
		{
			root: options.root ?? root(),
			...options,
		},
		testFsProxy(files),
	);
}

/**
 * @param {Record<string, boolean | string | Buffer>} [filePaths]
 * @returns {import('../lib/types.js').FSProxy}
 */
export function testFsProxy(filePaths = {}) {
	const cwd = root();
	const { fs } = memfs({}, cwd);
	const { lstat, open, readdir, readFile, realpath } = fs.promises;
	const b64UrlPrefix = /^data\:(\w+\/[\w\-\+\_]+)?\;base64,/;

	for (let [key, value] of Object.entries(filePaths)) {
		const path = key.startsWith(cwd) ? key : root(key);
		const dir = posixPath.dirname(path);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		let contents = typeof value === 'boolean' ? '' : value;
		if (typeof contents === 'string' && b64UrlPrefix.test(contents)) {
			contents = Buffer.from(contents.replace(b64UrlPrefix, ''), 'base64url');
		}
		fs.writeFileSync(path, contents);
		if (value === false) {
			fs.chmodSync(path, 0o000);
		}
	}

	return {
		dirSep: posixPath.sep,
		join: posixPath.join,
		async index(dirPath) {
			try {
				/** @type {any[]} */
				const entries = await readdir(dirPath, { withFileTypes: true });
				return entries.map((entry) => ({
					filePath: this.join(entry.parentPath, entry.name),
					kind: statsKind(entry),
				}));
			} catch {
				return [];
			}
		},
		async info(filePath) {
			const kind = await this.kind(filePath);
			const readable = await this.readable(filePath);
			return { filePath, kind, readable };
		},
		async kind(filePath) {
			try {
				const stats = await lstat(filePath);
				if (stats.isSymbolicLink()) return 'link';
				if (stats.isDirectory()) return 'dir';
				else if (stats.isFile()) return 'file';
				return null;
			} catch (err) {
				return null;
			}
		},
		// @ts-expect-error (memfs open doesn't have FileHandle#createReadStream)
		async open(filePath) {
			return open(filePath);
		},
		async readFile(filePath) {
			return readFile(filePath);
		},
		async readable(filePath, kind) {
			if (kind === undefined) {
				kind = await this.kind(filePath);
			}
			if (kind === 'dir' || kind === 'file') {
				const expected = kind === 'dir' ? ['7'] : ['7', '6', '4'];
				const user = (await lstat(filePath)).mode.toString(8).at(-3);
				return Boolean(user && expected.includes(user));
			}
			return false;
		},
		async realpath(filePath) {
			const real = await realpath(filePath);
			return typeof real === 'string' ? real : null;
		},
	};
}
