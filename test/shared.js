import { createFixture } from 'fs-fixture';
import { join, sep as dirSep } from 'node:path';
import { cwd } from 'node:process';

import { CLIArgs } from '../lib/args.js';
import { DEFAULT_OPTIONS } from '../lib/constants.js';
import { trimSlash } from '../lib/utils.js';

/**
@typedef {import('../lib/types.d.ts').DirIndexItem} DirIndexItem
@typedef {import('../lib/types.d.ts').FSEntryBase} FSEntryBase
@typedef {import('../lib/types.d.ts').FSEntryKind} FSEntryKind
@typedef {import('../lib/types.d.ts').ServerOptions} ServerOptions
*/

/** @type {(root?: string) => ServerOptions} */
export function getBlankOptions(root) {
	return {
		root: root ?? testPath(),
		host: '::',
		ports: [8080],
		gzip: false,
		cors: false,
		headers: [],
		dirList: false,
		dirFile: [],
		ext: [],
		exclude: [],
	};
}

/** @type {(root?: string) => ServerOptions} */
export function getDefaultOptions(root) {
	return {
		root: root ?? testPath(),
		...DEFAULT_OPTIONS,
	};
}

export function testPath(localPath = '') {
	return join(cwd(), '_servitsy_test_', localPath);
}

/** @type {(path?: string | TemplateStringsArray, ...values: string[]) => string} */
export function platformSlash(path = '', ...values) {
	path = String.raw({ raw: path }, ...values);
	const wrong = dirSep === '/' ? '\\' : '/';
	if (path.includes(wrong) && !path.includes(dirSep)) {
		return path.replaceAll(wrong, dirSep);
	}
	return path;
}

/** @type {(localPath: string, kind?: FSEntryKind) => FSEntryBase} */
export function file(localPath, kind = 'file') {
	return { filePath: testPath(localPath), kind };
}

/** @type {(localPath: string, target: FSEntryBase) => DirIndexItem} */
export function link(localPath, target) {
	/** @type {DirIndexItem} */
	const item = file(localPath, 'link');
	item.target = target;
	return item;
}

/**
@param {import('fs-fixture').FileTree} fileTree
*/
export async function fsFixture(fileTree) {
	const fixture = await createFixture(fileTree);
	const getPath = (localPath = '') => trimSlash(fixture.getPath(localPath), { end: true });
	return {
		fileTree,
		fixture,
		/** @type {(localPath: string, kind?: FSEntryKind) => FSEntryBase} */
		file(localPath = '', kind = 'file') {
			return { filePath: getPath(localPath), kind };
		},
		/** @type {(localPath?: string | TemplateStringsArray, ...values: string[]) => string} */
		root(localPath = '', ...values) {
			return getPath(String.raw({ raw: localPath }, ...values));
		},
	};
}

/** @type {(s?: string | TemplateStringsArray, ...v: string[]) => CLIArgs} */
export function argify(strings = '', ...values) {
	return new CLIArgs(
		String.raw({ raw: strings }, ...values)
			.trim()
			.split(/\s+/g),
	);
}
