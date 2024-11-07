import { deepStrictEqual, match, strictEqual } from 'node:assert';
import { platform } from 'node:os';
import { chmod } from 'node:fs/promises';
import { after, suite, test } from 'node:test';

import {
	getIndex,
	getKind,
	getRealpath,
	isReadable,
	readPkgFile,
	readPkgJson,
} from '../lib/fs-utils.js';
import { fsFixture } from './shared.js';

const isWindows = platform() === 'win32';

suite('fsUtils', async () => {
	// creating symlinks throws on Windows when not running as admin,
	// so we'll have to skip all symlink testing on Windows.
	const { fixture, path } = await fsFixture({
		'blocked/file.txt': '!!!',
		'blocked/link.txt': isWindows ? '' : ({ symlink }) => symlink('./file.txt'),
		'index.html': '<h1>Hello</h1>',
		'page1.html': '<h1>Page 1</h1>',
		'section1/index.html': '',
		'section1/other-page.html': '',
		'section1/sub-section/index.html': '',
		'section2/hello.txt': 'Hello!',
		'section2/link.html': isWindows ? '' : ({ symlink }) => symlink('../page1.html'),
	});

	after(() => fixture.rm());

	test('getIndex', async () => {
		const rootIndex = await getIndex(path());
		deepStrictEqual(rootIndex, [
			{ filePath: path`blocked`, kind: 'dir' },
			{ filePath: path`index.html`, kind: 'file' },
			{ filePath: path`page1.html`, kind: 'file' },
			{ filePath: path`section1`, kind: 'dir' },
			{ filePath: path`section2`, kind: 'dir' },
		]);

		const sectionIndex = await getIndex(path`section1`);
		deepStrictEqual(sectionIndex, [
			{ filePath: path`section1/index.html`, kind: 'file' },
			{ filePath: path`section1/other-page.html`, kind: 'file' },
			{ filePath: path`section1/sub-section`, kind: 'dir' },
		]);
	});

	test('getKind', async () => {
		strictEqual(await getKind(path``), 'dir');
		strictEqual(await getKind(path`section1`), 'dir');
		strictEqual(await getKind(path`index.html`), 'file');
		strictEqual(await getKind(path`section1/sub-section/index.html`), 'file');
		strictEqual(await getKind(path`section2/link.html`), isWindows ? 'file' : 'link');
	});

	test('getRealpath', async () => {
		strictEqual(await getRealpath(path``), path``);
		strictEqual(await getRealpath(path`page1.html`), path`page1.html`);
		strictEqual(
			await getRealpath(path`section2/link.html`),
			isWindows ? path`section2/link.html` : path`page1.html`,
		);
	});

	test('isReadable(file)', async () => {
		strictEqual(await isReadable(path``), true);
		strictEqual(await isReadable(path`page1.html`), true);
		strictEqual(await isReadable(path`section1/sub-section`), true);

		// make one file unreadable
		const blockedPath = path`blocked/file.txt`;
		strictEqual(await isReadable(blockedPath), true);
		if (!isWindows) {
			await chmod(blockedPath, 0o000);
			strictEqual(await isReadable(blockedPath), false);
		}

		// symlinks reflect the readable state of their target
		// (caveat: does not check +x permission if target is a dir)
		if (!isWindows) {
			strictEqual(await isReadable(path`section2/link.html`), true);
			strictEqual(await isReadable(path`blocked/link.txt`), false);
		}
	});
});

suite('readPkg', () => {
	test('readPkgFile', async () => {
		const license = await readPkgFile('LICENSE');
		match(license, /The MIT License/);

		const icons = await readPkgFile('assets/icons.svg');
		match(icons, / xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
	});

	test('readPkgJson', async () => {
		const pkg = await readPkgJson();
		strictEqual(typeof pkg, 'object');
		match(pkg.version, /^\d+\.\d+\./);
	});
});
