import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import { cwd } from 'node:process';
import { suite, test } from 'node:test';

import { DEFAULT_OPTIONS } from '../lib/constants.js';
import {
	isValidExt,
	isValidHeader,
	isValidHeaderRule,
	isValidHost,
	isValidPattern,
	isValidPort,
	serverOptions,
} from '../lib/options.js';
import { errorList } from '../lib/utils.js';

/**
@param {(input: any) => boolean} isValidFn
@returns {{ valid: (input: any) => void, invalid: (input: any) => void }}
*/
function makeValidChecks(isValidFn) {
	/** @type {(expected: boolean, input: any) => string} */
	const msg = (expected, input) => {
		return [
			`Expected to be ${expected ? 'valid' : 'invalid'}:`,
			`${isValidFn.name}(${JSON.stringify(input, null, '\t')})`,
		].join('\n');
	};

	return {
		valid(input) {
			strictEqual(isValidFn(input), true, msg(true, input));
		},
		invalid(input) {
			strictEqual(isValidFn(input), false, msg(false, input));
		},
	};
}

suite('isValidExt', () => {
	const { valid, invalid } = makeValidChecks(isValidExt);

	test('valid extensions', () => {
		valid('.txt');
		valid('.tar.gz');
		valid('.DS_Store');
		valid('.foo12-34BAR');
		valid('.1.2.3.4.5'); // max 5 components
		valid('.very_long.chain-.-of.Cool.Extensions'); // can get a bit unwieldly
	});

	test('invalid extensions', () => {
		invalid(undefined);
		invalid('');
		invalid('!');
		invalid('html'); // leading dot is required
		invalid('.test/index.html'); // no slashes is invalid
		invalid('.hé'); // basic latin letters only
		invalid('.1.2.3.4.5.6'); // max 5 components
	});
});

suite('isValidHeader', () => {
	const { valid, invalid } = makeValidChecks(isValidHeader);

	test('accepts strings with specific characters', () => {
		valid('a');
		valid('DNT');
		valid('Content-type');
		valid('X-my-H3AD3R');
		valid('COOL_STORY_BRO');
		valid('-_____-'); // a bit permissive currently ^^
	});

	test('rejects invalid values', () => {
		invalid(null);
		invalid(Math.PI);
		invalid('');
		invalid('Content Type');
		invalid('Content-Type ');
		invalid('Nice!');
		invalid('testé');
		invalid('DNT:1');
	});
});

suite('isValidHeaderRule', () => {
	const { valid, invalid } = makeValidChecks(isValidHeaderRule);

	test('accepts valid header rule objects', () => {
		valid({ headers: { 'content-type': 'text/html' } });
		valid({ headers: { a: 1, b: 2, c: 3 } });
		valid({ include: ['*'], headers: { 'content-type': 'text/html' } });
	});

	test('rejects invalid headers rules', () => {
		invalid(undefined);
		invalid('x-custom: a string is not a rule object');
		invalid({});
		invalid({ is: { not: 'valid' } });
		invalid({ headers: {} }); // a value is required
		invalid({ headers: { 'my cool header': 'nope' } }); // no spaces in header names
		invalid({ headers: { 'x-h1': ['1'] } });
		invalid({ headers: { 'x-h2': { dnt: '1' } } });
		invalid({ include: true, headers: { my_header: 'my_value' } });
		invalid({ include: '*.md', headers: { my_header: 'my_value' } });
	});
});

suite('isValidHost', () => {
	const { valid, invalid } = makeValidChecks(isValidHost);

	test('accepts domain-like strings', () => {
		valid('TEST');
		valid('localhost');
		valid('my-cool.Site.local');
		valid('a.b.c.d.e.f.g.h');
	});

	test('accepts ipv4 addresses', () => {
		valid('0.0.0.0');
		valid('1.2.3.4');
		valid('127.0.0.1');
		valid('192.168.0.99');
		valid('255.255.255.255');
	});

	test('accepts ipv6 addresses', () => {
		valid('::');
		valid('::1');
		valid('2001:db8:0:1:1:1:1:1');
		valid('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
		valid('2001:0DB8:85A3:0000:0000:8A2E:0370:7334');
	});

	test('rejects invalid chars', () => {
		invalid(false);
		invalid(null);
		invalid('');
		invalid('____');
		invalid('with spaces');
		invalid('piña-colada.dev');
		invalid('1.1::1.1');
		invalid('9999.9999:9999::::9999.9999');
		invalid('2001:0zb9::7334');
	});

	// not ideal, but don't want to make it stricter and possibly buggier
	test('accepts bad strings that only use ip characters', () => {
		valid(':');
		valid('.');
		valid('123...4567890...');
		valid('9999.9999.9999.9999.9999');
		valid('1::::1::::1::::1');
	});
});

suite('isValidPattern', () => {
	const { valid, invalid } = makeValidChecks(isValidPattern);

	test('accepts any file name', () => {
		valid('README.md');
		valid('  index.html  ');
		valid('Piña Colada! Forever');
	});

	test('rejects invalid type or empty string', () => {
		invalid(null);
		invalid(1);
		invalid('');
	});

	test('rejects reserved characters', () => {
		invalid('one:two');
		invalid('one\\two');
		invalid('//one-two');
		invalid('section/index.html');
	});
});

suite('isValidPort', () => {
	const { valid, invalid } = makeValidChecks(isValidPort);

	test('accepts positive integers within limit', () => {
		for (const num of [1, 80, 1337, 5175, 9999, 65_535]) {
			valid(num);
		}
	});

	test('rejects other values', () => {
		invalid(undefined);
		invalid('1337');
		for (const num of [0, 65_536, -100, Math.PI, Infinity, 0 / 0]) {
			invalid(num);
		}
	});
});

suite('serverOptions', () => {
	test('returns default options with empty input', () => {
		const onError = errorList();
		const { root, ...result } = serverOptions({ root: cwd() }, { onError });
		deepStrictEqual(result, DEFAULT_OPTIONS);
		deepStrictEqual(onError.list, []);
	});

	test('preserves valid options', () => {
		const onError = errorList();

		/** @type {Parameters<serverOptions>[0]} */
		const testOptions1 = {
			root: cwd(),
			dirList: false,
			gzip: false,
			cors: true,
		};
		deepStrictEqual(serverOptions(testOptions1, { onError }), {
			...DEFAULT_OPTIONS,
			...testOptions1,
		});

		/** @type {Parameters<serverOptions>[0]} */
		const testOptions2 = {
			root: cwd(),
			ext: ['.htm', '.TXT'],
			dirFile: ['page.md', 'Index Page.html'],
			exclude: ['.htaccess', '*.*.*', '_*'],
			headers: [{ include: ['*.md', '*.html'], headers: { dnt: 1 } }],
			host: '192.168.1.199',
		};
		deepStrictEqual(serverOptions(testOptions2, { onError }), {
			...DEFAULT_OPTIONS,
			...testOptions2,
		});

		deepStrictEqual(onError.list, []);
	});

	test('rejects invalid values', () => {
		const onError = errorList();
		const inputs = {
			root: 'this/path/doesnt/exist',
			cors: null,
			dirFile: [undefined, 'invalid/value', 'C:\\Temp'],
			dirList: {},
			exclude: [{}, 'section/*.json', 'a:b:c:d', 'no\\pe'],
			ext: ['html', 'txt', './index.html', '..'],
			gzip: undefined,
			headers: [],
			host: 'cool.test:3000',
			ports: [0, 100_000],
		};
		const { root, ...result } = serverOptions(
			// @ts-expect-error
			inputs,
			{ onError },
		);
		ok(typeof root === 'string');
		ok(Object.keys(result).length >= 9);
		deepStrictEqual(result, DEFAULT_OPTIONS);
	});
});
