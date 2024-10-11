import { createFixture } from 'fs-fixture';
import { join, sep as dirSep } from 'node:path';
import { cwd } from 'node:process';

import { CLIArgs } from '../lib/args.js';
import { DIR_FILE_DEFAULT, EXTENSIONS_DEFAULT, FILE_EXCLUDE_DEFAULT } from '../lib/constants.js';
import { trimSlash } from '../lib/utils.js';

/**
@typedef {import('../lib/types.js').DirIndexItem} DirIndexItem
@typedef {import('../lib/types.js').FSEntryKind} FSEntryKind
@typedef {import('../lib/types.js').ResolvedFile} ResolvedFile
@typedef {import('../lib/types.js').ServerOptions} ServerOptions
@typedef {{path: string; kind: FSEntryKind, readable: boolean; link?: string}} VFile
**/

/** @type {(root?: string) => ServerOptions} */
export function getBlankOptions(root) {
	return {
		root: root ?? testPath(),
		dirFile: [],
		dirList: false,
		ext: [],
		exclude: [],
		cors: false,
		headers: [],
		gzip: false,
	};
}

/** @type {(root?: string) => ServerOptions} */
export function getDefaultOptions(root) {
	return {
		root: root ?? testPath(),
		dirFile: [...DIR_FILE_DEFAULT],
		dirList: true,
		ext: [...EXTENSIONS_DEFAULT],
		exclude: [...FILE_EXCLUDE_DEFAULT],
		cors: false,
		headers: [],
		gzip: true,
	};
}

export function testPath(localPath = '') {
	return join(cwd(), '_servitsy_test_', localPath);
}

/**
 * @type {(path?: string | TemplateStringsArray, ...values: string[]) => string}
 */
export function platformSlash(path = '', ...values) {
	path = String.raw({ raw: path }, ...values);
	const wrong = dirSep === '/' ? '\\' : '/';
	if (path.includes(wrong) && !path.includes(dirSep)) {
		return path.replaceAll(wrong, dirSep);
	}
	return path;
}

/**
 * @type {(localPath: string, kind?: FSEntryKind) => ResolvedFile}
 */
export function file(localPath, kind = 'file') {
	return {
		filePath: testPath(localPath),
		localPath: platformSlash(localPath),
		kind,
	};
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
 * @param {import('fs-fixture').FileTree} fileTree
 */
export async function fsFixture(fileTree) {
	const fixture = await createFixture(fileTree);
	const getPath = (localPath = '') => trimSlash(fixture.getPath(localPath), { end: true });
	return {
		fileTree,
		fixture,
		/** @type {(localPath: string, kind?: FSEntryKind) => ResolvedFile} */
		file(localPath = '', kind = 'file') {
			return {
				filePath: getPath(localPath),
				localPath: platformSlash(localPath),
				kind,
			};
		},
		/** @type {(localPath?: string | TemplateStringsArray, ...values: string[]) => string} */
		root(localPath = '', ...values) {
			return getPath(String.raw({ raw: localPath }, ...values));
		},
	};
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
