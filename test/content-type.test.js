import { strictEqual } from 'node:assert';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { suite, test } from 'node:test';

import {
	getContentType,
	isBinHeader,
	isBinDataByte,
	typeForFilePath,
} from '../lib/content-type.js';

suite('getContentType', () => {
	/** @type {(path: string) => Promise<string>} */
	const fromFileName = async (path) => {
		const result = await getContentType({ filePath: path });
		return result.toString();
	};
	/** @type {(handle: import('node:fs/promises').FileHandle) => Promise<string>} */
	const fromFileHandle = async (handle) => {
		const result = await getContentType({ fileHandle: handle });
		return result.toString();
	};

	test('identifies known extensions', async () => {
		strictEqual(await fromFileName('index.html'), 'text/html; charset=UTF-8');
		strictEqual(await fromFileName('vendor.a45f981c.min.js'), 'text/javascript; charset=UTF-8');
		strictEqual(await fromFileName('!!!.css'), 'text/css; charset=UTF-8');
		strictEqual(await fromFileName('image.png'), 'image/png');
		strictEqual(await fromFileName('myfont.woff2'), 'font/woff2');
	});

	test('sniffs text files from file handle', async () => {
		const thisFile = await open(join(cwd(), 'test/content-type.test.js'));
		const otherFile = await open(join(cwd(), 'CHANGELOG.md'));
		strictEqual(await fromFileHandle(thisFile), 'text/plain; charset=UTF-8');
		strictEqual(await fromFileHandle(otherFile), 'text/plain; charset=UTF-8');
		await thisFile.close();
		await otherFile.close();
	});
});

suite('typeForFilePath', () => {
	const defaultBin = 'application/octet-stream';
	const defaultText = 'text/plain';

	const checkType = (fileName = '', expected = '') => {
		strictEqual(typeForFilePath(fileName, null).toString(), expected);
	};

	test('defaults to binary content type', () => {
		checkType('', defaultBin);
		checkType('foo', defaultBin);
		checkType('!!!!', defaultBin);
	});

	test('identifies bin types from file name', () => {
		checkType('image.png', 'image/png');
		checkType('Photos/DSC_4567.JPEG', 'image/jpg');
		checkType('myfont.woff2', 'font/woff2');
		checkType('MyApp.dng', defaultBin);
		checkType('cool-installer.msi', defaultBin);
	});

	test('identifies text types from file name', () => {
		checkType('WELCOME.HTM', 'text/html');
		checkType('README.md', 'text/markdown');
		checkType('styles.css', 'text/css');
		checkType('data.json', 'application/json');
		checkType('component.js', 'text/javascript');
		checkType('file.txt', defaultText);
		checkType('README', defaultText);
		checkType('LICENSE', defaultText);
		checkType('dev.log', defaultText);
		checkType('.bashrc', defaultText);
		checkType('.gitkeep', defaultText);
		checkType('.npmignore', defaultText);
	});
});

suite('isBinHeader', () => {
	const NUL = 0x00;
	const SP = 0x20;

	test('empty file is not binary', () => {
		strictEqual(isBinHeader(new Uint8Array([])), false);
	});

	test('starts with binary data bytes', () => {
		strictEqual(isBinHeader(new Uint8Array([0x00, SP, SP, SP])), true);
		strictEqual(isBinHeader(new Uint8Array([0x0b, SP, SP, SP])), true);
		strictEqual(isBinHeader(new Uint8Array([0x1f, SP, SP, SP])), true);
	});

	test('binary data byte within header', () => {
		const base = new Uint8Array(1500);
		base.fill(SP);

		const arr1 = new Uint8Array(base);
		const arr2 = new Uint8Array(base);
		arr1[750] = NUL;
		arr2[arr2.length - 1] = NUL;

		strictEqual(isBinHeader(base), false);
		strictEqual(isBinHeader(arr1), true);
		strictEqual(isBinHeader(arr2), true);
	});

	test('binary data byte is ignored if after the 2000th byte', () => {
		const arr = new Uint8Array(5000);
		arr.fill(SP);
		arr[arr.length - 1] = NUL;
		strictEqual(isBinHeader(arr), false);
	});

	test('UTF-8 BOM', () => {
		strictEqual(isBinHeader(new Uint8Array([0xef, 0xbb, 0xbf])), false);
		strictEqual(isBinHeader(new Uint8Array([0xef, 0xbb, 0xbf, SP, SP, NUL])), false);
	});

	test('UTF-16 BOM', () => {
		strictEqual(isBinHeader(new Uint8Array([0xfe, 0xff])), false);
		strictEqual(isBinHeader(new Uint8Array([0xff, 0xfe])), false);
		strictEqual(isBinHeader(new Uint8Array([0xfe, 0xff, SP, SP, NUL])), false);
		strictEqual(isBinHeader(new Uint8Array([0xff, 0xfe, SP, SP, NUL])), false);
	});

	test('UTF-8 string', () => {});
});

suite('isBinDataByte', () => {
	test('identifies binary data bytes', () => {
		const bytes = [
			0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0e, 0x0f, 0x10, 0x11, 0x12,
			0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1c, 0x1d, 0x1e, 0x1f,
		];
		for (const byte of bytes) {
			strictEqual(isBinDataByte(byte), true, `${byte} is a binary data byte`);
		}
	});
	test('avoids false positives', () => {
		const other = [-257, -50, -1, 0x09, 0x0a, 0x0c, 0x0d, 0x1b, 0x20, 0x21, 0x2f, 100, 255, 256];
		for (const num of other) {
			strictEqual(isBinDataByte(num), false, `${num} is not a binary data byte`);
		}
	});
});
