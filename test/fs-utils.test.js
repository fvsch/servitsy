import { deepStrictEqual, match, strictEqual } from 'node:assert';
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

suite('fsUtils', async () => {
	const { fixture, root } = await fsFixture({
		'blocked/file.txt': '!!!',
		'blocked/link.txt': ({ symlink }) => symlink('./file.txt'),
		'index.html': '<h1>Hello</h1>',
		'page1.html': '<h1>Page 1</h1>',
		'section1/index.html': '',
		'section1/other-page.html': '',
		'section1/sub-section/index.html': '',
		'section2/hello.txt': 'Hello!',
		'section2/link.html': ({ symlink }) => symlink('../page1.html'),
	});

	after(() => fixture.rm());

	test('getIndex', async () => {
		const rootIndex = await getIndex(root());
		deepStrictEqual(rootIndex, [
			{ filePath: root`blocked`, kind: 'dir' },
			{ filePath: root`index.html`, kind: 'file' },
			{ filePath: root`page1.html`, kind: 'file' },
			{ filePath: root`section1`, kind: 'dir' },
			{ filePath: root`section2`, kind: 'dir' },
		]);

		const sectionIndex = await getIndex(root`section1`);
		deepStrictEqual(sectionIndex, [
			{ filePath: root`section1/index.html`, kind: 'file' },
			{ filePath: root`section1/other-page.html`, kind: 'file' },
			{ filePath: root`section1/sub-section`, kind: 'dir' },
		]);
	});

	test('getKind', async () => {
		strictEqual(await getKind(root``), 'dir');
		strictEqual(await getKind(root`section1`), 'dir');
		strictEqual(await getKind(root`index.html`), 'file');
		strictEqual(await getKind(root`section1/sub-section/index.html`), 'file');
		strictEqual(await getKind(root`section2/link.html`), 'link');
	});

	test('getRealpath', async () => {
		strictEqual(await getRealpath(root``), root``);
		strictEqual(await getRealpath(root`page1.html`), root`page1.html`);
		strictEqual(await getRealpath(root`section2/link.html`), root`page1.html`);
	});

	test('isReadable', async () => {
		strictEqual(await isReadable(root``), true);
		strictEqual(await isReadable(root`page1.html`), true);
		strictEqual(await isReadable(root`section1/sub-section`), true);

		// make one file unreadable
		const blockedPath = root`blocked/file.txt`;
		strictEqual(await isReadable(blockedPath), true);
		await chmod(blockedPath, 0o000);
		strictEqual(await isReadable(blockedPath), false);

		// symlinks reflect the readable state of their target
		// (caveat: does not check +x permission if target is a dir)
		strictEqual(await isReadable(root`section2/link.html`), true);
		strictEqual(await isReadable(root`blocked/link.txt`), false);
	});
});

suite('readPkg', () => {
	test('readPkgFile', async () => {
		const license = await readPkgFile('LICENSE');
		match(license, /The MIT License/);

		const icons = await readPkgFile('lib/assets/icons.svg');
		match(icons, / xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
	});

	test('readPkgJson', async () => {
		const pkg = await readPkgJson();
		strictEqual(typeof pkg, 'object');
		match(pkg.version, /^\d+\.\d+\./);
	});
});
