import { platform } from 'node:os';
import { chmod } from 'node:fs/promises';
import { afterAll, expect, suite, test } from 'vitest';

import { checkDirAccess, getIndex, getKind, getRealpath, isReadable } from '../src/fs-utils.ts';
import { errorList } from '../src/utils.ts';
import { fsFixture } from './shared.ts';

const isWindows = platform() === 'win32';

suite('fs utils', async () => {
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

	afterAll(() => fixture.rm());

	test('checkDirAccess', async () => {
		const onError = errorList();
		expect(await checkDirAccess(path``, onError)).toBe(true);
		expect(await checkDirAccess(path`section1`, onError)).toBe(true);
		const notAFolder = path`doesnt/exist`;
		expect(await checkDirAccess(notAFolder, onError)).toBe(false);
		expect(onError.list).toEqual([`not a directory: ${notAFolder}`]);
	});

	test('getIndex', async () => {
		const rootIndex = await getIndex(path());
		expect(rootIndex).toEqual([
			{ filePath: path`blocked`, kind: 'dir' },
			{ filePath: path`index.html`, kind: 'file' },
			{ filePath: path`page1.html`, kind: 'file' },
			{ filePath: path`section1`, kind: 'dir' },
			{ filePath: path`section2`, kind: 'dir' },
		]);

		const sectionIndex = await getIndex(path`section1`);
		expect(sectionIndex).toEqual([
			{ filePath: path`section1/index.html`, kind: 'file' },
			{ filePath: path`section1/other-page.html`, kind: 'file' },
			{ filePath: path`section1/sub-section`, kind: 'dir' },
		]);
	});

	test('getKind', async () => {
		expect(await getKind(path``)).toBe('dir');
		expect(await getKind(path`section1`)).toBe('dir');
		expect(await getKind(path`index.html`)).toBe('file');
		expect(await getKind(path`section1/sub-section/index.html`)).toBe('file');
		if (!isWindows) {
			expect(await getKind(path`section2/link.html`)).toBe('link');
		}
	});

	test('getRealpath', async () => {
		expect(await getRealpath(path``)).toBe(path``);
		expect(await getRealpath(path`page1.html`)).toBe(path`page1.html`);
		if (!isWindows) {
			expect(await getRealpath(path`section2/link.html`)).toBe(path`page1.html`);
		}
	});

	test('isReadable(file)', async () => {
		expect(await isReadable(path``)).toBe(true);
		expect(await isReadable(path`page1.html`)).toBe(true);
		expect(await isReadable(path`section1/sub-section`)).toBe(true);

		// make one file unreadable
		const blockedPath = path`blocked/file.txt`;
		expect(await isReadable(blockedPath)).toBe(true);
		if (!isWindows) {
			await chmod(blockedPath, 0o000);
			expect(await isReadable(blockedPath)).toBe(false);
		}

		// symlinks reflect the readable state of their target
		// (caveat: does not check +x permission if target is a dir)
		if (!isWindows) {
			expect(await isReadable(path`section2/link.html`)).toBe(true);
			expect(await isReadable(path`blocked/link.txt`)).toBe(false);
		}
	});
});
