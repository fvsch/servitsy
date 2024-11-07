import { join, resolve, sep as dirSep } from 'node:path';
import { cwd } from 'node:process';
import { createFixture } from 'fs-fixture';

import { CLIArgs } from '../lib/args.js';
import { DEFAULT_OPTIONS } from '../lib/constants.js';
import { trimSlash } from '../lib/utils.js';

/**
@typedef {import('../lib/types.d.ts').FSLocation} FSLocation
@typedef {import('../lib/types.d.ts').ServerOptions} ServerOptions
*/

export const loc = testPathUtils(join(cwd(), '_servitsy_test_'));

/**
@type {(s?: string | TemplateStringsArray, ...v: string[]) => CLIArgs}
*/
export function argify(strings = '', ...values) {
	return new CLIArgs(
		String.raw({ raw: strings }, ...values)
			.trim()
			.split(/\s+/g),
	);
}

/**
@param {import('fs-fixture').FileTree} fileTree
*/
export async function fsFixture(fileTree) {
	const fixture = await createFixture(fileTree);
	return { fileTree, fixture, ...testPathUtils(fixture.path) };
}

/**
@type {(root?: string) => ServerOptions}
*/
export function getBlankOptions(root) {
	return {
		root: root ?? loc.path(),
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

/**
@type {(root?: string) => ServerOptions}
*/
export function getDefaultOptions(root) {
	return {
		root: root ?? loc.path(),
		...DEFAULT_OPTIONS,
	};
}

/**
@type {(path?: string | TemplateStringsArray, ...values: string[]) => string}
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
@param {string} root
*/
function testPathUtils(root) {
	/** @type {(localPath?: string | TemplateStringsArray, ...values: string[]) => string} */
	const path = (localPath = '', ...values) => {
		const subpath = String.raw({ raw: localPath }, ...values);
		const full = resolve(root, subpath);
		return full.length >= 2 ? trimSlash(full, { start: false, end: true }) : full;
	};

	return {
		path,
		/** @type {(localPath: string) => FSLocation} */
		dir(localPath) {
			return { filePath: path(localPath), kind: 'dir' };
		},
		/** @type {(localPath: string, target?: FSLocation) => FSLocation} */
		file(localPath, target) {
			if (target) {
				return { filePath: path(localPath), kind: 'link', target };
			}
			return { filePath: path(localPath), kind: 'file' };
		},
	};
}
