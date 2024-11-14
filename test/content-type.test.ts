import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, suite, test } from 'vitest';

import { getContentType, isBinHeader, isBinDataByte, typeForFilePath } from '#src/content-type.js';

suite('getContentType', () => {
	const $path = async (path: string, expected: string) => {
		const type = await getContentType({ path });
		expect(type.toString()).toBe(expected);
	};
	const $file = async (localPath: string, expected: string) => {
		const filePath = join(import.meta.dirname, '..', localPath);
		const handle = await open(filePath);
		const type = await getContentType({ handle });
		expect(type.toString()).toBe(expected);
		await handle.close();
	};

	test('identifies known extensions', async () => {
		await $path('index.html', 'text/html; charset=UTF-8');
		await $path('vendor.a45f981c.min.js', 'text/javascript; charset=UTF-8');
		await $path('!!!.css', 'text/css; charset=UTF-8');
		await $path('image.png', 'image/png');
		await $path('myfont.woff2', 'font/woff2');
	});

	test('sniffs text or bin type from file handle', async () => {
		await $file('test/content-type.test.ts', 'text/plain; charset=UTF-8');
		await $file('doc/changelog.md', 'text/plain; charset=UTF-8');
		await $file('LICENSE', 'text/plain; charset=UTF-8');
		await $file('doc/example.png', 'application/octet-stream');
	});
});

suite('typeForFilePath', () => {
	const defaultBin = 'application/octet-stream';
	const defaultText = 'text/plain';

	const $type = (fileName = '', expected = '') => {
		expect(typeForFilePath(fileName, '').toString()).toBe(expected);
	};

	test('defaults to binary content type', () => {
		$type('', defaultBin);
		$type('foo', defaultBin);
		$type('!!!!', defaultBin);
	});

	test('identifies bin types from file name', () => {
		$type('image.png', 'image/png');
		$type('Photos/DSC_4567.JPEG', 'image/jpg');
		$type('myfont.woff2', 'font/woff2');
		$type('MyApp.dng', defaultBin);
		$type('cool-installer.msi', defaultBin);
	});

	test('identifies text types from file name', () => {
		$type('WELCOME.HTM', 'text/html');
		$type('README.md', 'text/markdown');
		$type('styles.css', 'text/css');
		$type('data.json', 'application/json');
		$type('component.js', 'text/javascript');
		$type('file.txt', defaultText);
		$type('README', defaultText);
		$type('LICENSE', defaultText);
		$type('dev.log', defaultText);
		$type('.bashrc', defaultText);
		$type('.gitkeep', defaultText);
		$type('.npmignore', defaultText);
	});
});

suite('isBinHeader', () => {
	const NUL = 0x00;
	const SP = 0x20;

	const $bin = (bytes: Uint8Array, expected: boolean) => {
		expect(isBinHeader(bytes)).toBe(expected);
	};

	test('empty file is not binary', () => {
		$bin(new Uint8Array([]), false);
	});

	test('starts with binary data bytes', () => {
		$bin(new Uint8Array([0x00, SP, SP, SP]), true);
		$bin(new Uint8Array([0x0b, SP, SP, SP]), true);
		$bin(new Uint8Array([0x1f, SP, SP, SP]), true);
	});

	test('binary data byte within header', () => {
		const base = new Uint8Array(1500);
		base.fill(SP);

		const arr1 = new Uint8Array(base);
		const arr2 = new Uint8Array(base);
		arr1[750] = NUL;
		arr2[arr2.length - 1] = NUL;

		$bin(base, false);
		$bin(arr1, true);
		$bin(arr2, true);
	});

	test('binary data byte is ignored if after the 2000th byte', () => {
		const arr = new Uint8Array(5000);
		arr.fill(SP);
		arr[arr.length - 1] = NUL;
		$bin(arr, false);
	});

	test('UTF-8 BOM', () => {
		$bin(new Uint8Array([0xef, 0xbb, 0xbf]), false);
		$bin(new Uint8Array([0xef, 0xbb, 0xbf, SP, SP, NUL]), false);
	});

	test('UTF-16 BOM', () => {
		$bin(new Uint8Array([0xfe, 0xff]), false);
		$bin(new Uint8Array([0xff, 0xfe]), false);
		$bin(new Uint8Array([0xfe, 0xff, SP, SP, NUL]), false);
		$bin(new Uint8Array([0xff, 0xfe, SP, SP, NUL]), false);
	});
});

suite('isBinDataByte', () => {
	test('identifies binary data bytes', () => {
		const bytes = [
			0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0e, 0x0f, 0x10, 0x11, 0x12,
			0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1c, 0x1d, 0x1e, 0x1f,
		];
		for (const byte of bytes) {
			expect(isBinDataByte(byte), `${byte} is a binary data byte`).toBe(true);
		}
	});
	test('avoids false positives', () => {
		const other = [-257, -50, -1, 0x09, 0x0a, 0x0c, 0x0d, 0x1b, 0x20, 0x21, 0x2f, 100, 255, 256];
		for (const num of other) {
			expect(isBinDataByte(num), `${num} is not a binary data byte`).toBe(false);
		}
	});
});
