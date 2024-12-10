import { join, resolve, sep as dirSep } from 'node:path';
import { cwd } from 'node:process';
import { createFixture } from 'fs-fixture';

import { DEFAULT_OPTIONS } from '../src/constants.ts';
import type { FSLocation, RuntimeOptions } from '../src/types.d.ts';
import { trimSlash } from '../src/utils.ts';

export const loc = testPathUtils(join(cwd(), '_servitsy_test_'));

export async function fsFixture(fileTree: import('fs-fixture').FileTree) {
	const fixture = await createFixture(fileTree);
	return { fileTree, fixture, ...testPathUtils(fixture.path) };
}

export function getBlankOptions(root?: string): RuntimeOptions {
	return {
		root: root ?? loc.path(),
		host: undefined,
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

export function getDefaultOptions(root?: string): RuntimeOptions {
	return {
		root: root ?? loc.path(),
		...DEFAULT_OPTIONS,
	};
}

export function platformSlash(path: string | TemplateStringsArray = '', ...values: string[]) {
	path = String.raw({ raw: path }, ...values);
	const wrong = dirSep === '/' ? '\\' : '/';
	if (path.includes(wrong) && !path.includes(dirSep)) {
		return path.replaceAll(wrong, dirSep);
	}
	return path;
}

function testPathUtils(root: string) {
	const path = (localPath: string | TemplateStringsArray = '', ...values: string[]) => {
		const subpath = String.raw({ raw: localPath }, ...values);
		const full = resolve(root, subpath);
		return full.length >= 2 ? trimSlash(full, { start: false, end: true }) : full;
	};

	return {
		path,
		dir(localPath: string): FSLocation {
			return { filePath: path(localPath), kind: 'dir' };
		},
		file(localPath: string, target?: FSLocation): FSLocation {
			if (target) {
				return { filePath: path(localPath), kind: 'link', target };
			}
			return { filePath: path(localPath), kind: 'file' };
		},
	};
}
