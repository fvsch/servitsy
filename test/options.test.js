import { deepStrictEqual, strictEqual } from 'node:assert';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { suite, test } from 'node:test';

import {
	isValidExt,
	isValidHeader,
	isValidHeaderRule,
	isValidHost,
	isValidPattern,
	isValidPort,
	OptionsValidator,
	serverOptions,
} from '../lib/options.js';
import { errorsContext } from '../lib/utils.js';

/**
@typedef {import('../lib/types.js').HttpHeaderRule} HttpHeaderRule
@typedef {import('../lib/types.js').ListenOptions} ListenOptions
@typedef {import('../lib/types.js').ServerOptions} ServerOptions
**/

const defaultPorts = [8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089];

/** @type {ListenOptions & ServerOptions} */
const defaultOptions = {
	cors: false,
	dirFile: ['index.html'],
	dirList: true,
	exclude: ['.*', '!.well-known'],
	ext: ['.html'],
	gzip: true,
	headers: [],
	host: '::',
	ports: defaultPorts,
	root: cwd(),
};

/**
 * @param {(input: any) => boolean} isValidFn
 * @returns {{ valid: (input: any) => void, invalid: (input: any) => void }}
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
		const context = errorsContext();
		const result = serverOptions({}, context);
		deepStrictEqual(result, defaultOptions);
		deepStrictEqual(context.errors, []);
	});

	test('preserves valid options', () => {
		const context = errorsContext();

		/** @type {Partial<ListenOptions & ServerOptions>} */
		const testOptions1 = {
			dirList: false,
			gzip: false,
			cors: true,
		};
		deepStrictEqual(serverOptions(testOptions1, context), {
			...defaultOptions,
			...testOptions1,
		});

		/** @type {Partial<ListenOptions & ServerOptions>} */
		const testOptions2 = {
			ext: ['.htm', '.TXT'],
			dirFile: ['page.md', 'Index Page.html'],
			exclude: ['.htaccess', '*.*.*', '_*'],
			headers: [{ include: ['*.md', '*.html'], headers: { dnt: 1 } }],
			host: '192.168.1.199',
		};
		deepStrictEqual(serverOptions(testOptions2, context), {
			...defaultOptions,
			...testOptions2,
		});

		deepStrictEqual(context.errors, []);
	});
});
