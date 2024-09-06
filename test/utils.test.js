import { deepStrictEqual, strictEqual, throws } from 'node:assert';
import { sep } from 'node:path';
import { suite, test } from 'node:test';

import {
	clamp,
	contentType,
	escapeHtml,
	fwdPath,
	getDirname,
	isPrivateIPv4,
	intRange,
} from '../lib/utils.js';

suite('clamp', () => {
	test('keeps the value when between bounds', () => {
		strictEqual(clamp(1, 0, 2), 1);
		strictEqual(clamp(Math.PI, -10, 10), Math.PI);
		strictEqual(clamp(-50, -Infinity, Infinity), -50);
		strictEqual(
			clamp(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, Infinity),
			Number.MAX_SAFE_INTEGER,
		);
	});

	test('constrains the value when outside of bounds', () => {
		strictEqual(clamp(-1, 0, 1), 0);
		strictEqual(clamp(2, -1, 1), 1);
		strictEqual(clamp(Infinity, 0, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
		strictEqual(clamp(-Infinity, 0, Number.MAX_SAFE_INTEGER), 0);

		// maximum wins over minimum
		strictEqual(clamp(5, 10, 0), 0);
		strictEqual(clamp(50, 10, 0), 0);
		strictEqual(clamp(0, 10, -10), -10);
	});
});

suite('contentType', () => {
	const charset = 'UTF-8';
	const typeOnly = (t = '') => contentType(t, null);

	test('defaults to binary content type', () => {
		strictEqual(typeOnly(''), 'application/octet-stream');
	});

	test('identifies text types from file name', () => {
		strictEqual(typeOnly('file.txt'), 'text/plain');
		strictEqual(typeOnly('README.MD'), 'text/markdown');
		strictEqual(typeOnly('component.js'), 'text/javascript');
		strictEqual(typeOnly('DATA.JSON'), 'application/json');
		strictEqual(typeOnly('styles.css'), 'text/css');
		strictEqual(typeOnly('.bashrc'), 'text/plain');
		strictEqual(typeOnly('.gitkeep'), 'text/plain');
		strictEqual(typeOnly('.npmignore'), 'text/plain');
	});

	test('identifies bin types from file name', () => {
		strictEqual(typeOnly('image.png'), 'image/png');
		strictEqual(typeOnly('Photos/DSC_4567.JPEG'), 'image/jpg');
		strictEqual(typeOnly('myfont.woff2'), 'font/woff2');
	});

	test('adds optional charset for text types only', () => {
		strictEqual(contentType('file1.txt'), 'text/plain; charset=UTF-8');
		strictEqual(contentType('file2.txt', 'UTF8'), 'text/plain; charset=UTF8');
		strictEqual(contentType('file3.txt', 'ISO-8859-1'), 'text/plain; charset=ISO-8859-1');
		strictEqual(contentType('lib.so', charset), 'application/octet-stream');
		strictEqual(contentType('image.png', charset), 'image/png');
	});
});

suite('escapeHtml', () => {
	test('escapes & charachters', () => {
		const input = `"Ampersand&Sons"`;
		strictEqual(escapeHtml(input, 'text'), `"Ampersand&amp;Sons"`);
		strictEqual(escapeHtml(input, 'attr'), `&quot;Ampersand&amp;Sons&quot;`);
	});

	test('escapes HTML comments', () => {
		const input = `<!--hmm-->`;
		strictEqual(escapeHtml(input, 'text'), `&lt;!--hmm--&gt;`);
		strictEqual(escapeHtml(input, 'attr'), `&lt;!--hmm--&gt;`);
	});

	test('escapes HTML tags', () => {
		const input = `<script>alert(document.location = "/admin")`;
		strictEqual(escapeHtml(input, 'text'), `&lt;script&gt;alert(document.location = "/admin")`);
		strictEqual(
			escapeHtml(input, 'attr'),
			`&lt;script&gt;alert(document.location = &quot;/admin&quot;)`,
		);
	});
});

suite('fwdPath', () => {
	test('leaves conforming paths untouched', () => {
		const paths = ['hello.jpg', './world', '/Users/bobesponja/Downloads/invoice.pdf', '/etc/hosts'];
		for (const item of paths) {
			strictEqual(fwdPath(item), item);
		}
	});

	test('replaces backwards slashes', () => {
		strictEqual(fwdPath('\\hello\\world'), '/hello/world');
		strictEqual(fwdPath('/mixed\\slashes/around\\here'), '/mixed/slashes/around/here');
		strictEqual(
			fwdPath('C:\\Users\\BobEsponja\\Application Data'),
			'C:/Users/BobEsponja/Application Data',
		);
	});

	test('deduplicates slashes', () => {
		strictEqual(fwdPath('//hello'), '/hello');
		strictEqual(fwdPath('////////'), '/');
		strictEqual(fwdPath('a//b\\\\//\\c////d'), 'a/b/c/d');
	});

	test('removes trailing slash', () => {
		strictEqual(fwdPath('./hello/'), './hello');
		strictEqual(fwdPath('ok/'), 'ok');
		strictEqual(fwdPath('/'), '/');
	});
});

suite('isPrivateIPv4', () => {
	test('rejects invalid addresses', () => {
		strictEqual(isPrivateIPv4(''), false);
		strictEqual(isPrivateIPv4('192.168'), false);
		strictEqual(isPrivateIPv4('192.168.0.1000'), false);
	});

	test('rejects addresses out of private ranges', () => {
		strictEqual(isPrivateIPv4('0.0.0.0'), false);
		strictEqual(isPrivateIPv4('11.11.11.11'), false);
		strictEqual(isPrivateIPv4('172.32.1.1'), false);
		strictEqual(isPrivateIPv4('255.255.255.255'), false);
	});

	test('accepts addresses in private ranges', () => {
		strictEqual(isPrivateIPv4('10.0.0.0'), true);
		strictEqual(isPrivateIPv4('10.10.10.10'), true);
		strictEqual(isPrivateIPv4('10.255.255.255'), true);
		strictEqual(isPrivateIPv4('172.16.0.0'), true);
		strictEqual(isPrivateIPv4('172.24.0.10'), true);
		strictEqual(isPrivateIPv4('172.31.255.255'), true);
		strictEqual(isPrivateIPv4('192.168.0.0'), true);
		strictEqual(isPrivateIPv4('192.168.1.1'), true);
		strictEqual(isPrivateIPv4('192.168.99.199'), true);
		strictEqual(isPrivateIPv4('192.168.255.255'), true);
	});
});

suite('getDirname', () => {
	test('returns the __dirname for a ESM module', () => {
		strictEqual(
			getDirname(import.meta.url)
				.split(sep)
				.filter((s) => s.length > 0)
				.at(-1),
			'test',
		);
	});
});

suite('intRange', () => {
	test('unlimited', () => {
		deepStrictEqual(intRange(1, 5), [1, 2, 3, 4, 5]);
		deepStrictEqual(intRange(1, -5), [1, 0, -1, -2, -3, -4, -5]);
		deepStrictEqual(intRange(-0.5, 9.5), [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

		deepStrictEqual(intRange(10, 10), [10]);
		deepStrictEqual(intRange(10.1, 10.9), [10]);
		deepStrictEqual(intRange(10, 9), [10, 9]);

		const oneThousand = intRange(1, 1000);
		strictEqual(oneThousand.length, 1000);
		strictEqual(oneThousand.at(500), 501);
		strictEqual(oneThousand.at(-1), 1000);
	});

	test('with limit', () => {
		const limit1 = intRange(1_000_001, 2_000_000, 50);
		strictEqual(limit1.length, 50);
		strictEqual(limit1.at(0), 1_000_001);
		strictEqual(limit1.at(-1), 1_000_050);

		const limit2 = intRange(1_000_001, 2_000_000, 0);
		strictEqual(limit2.length, 0);

		throws(() => intRange(1, 100, -50), /Invalid limit: -50/);
	});
});
