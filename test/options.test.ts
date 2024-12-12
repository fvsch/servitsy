import { cwd } from 'node:process';
import { expect, suite, test } from 'vitest';

import { DEFAULT_OPTIONS } from '../src/constants.ts';
import {
	isValidExt,
	isValidHeader,
	isValidHeaderRule,
	isValidHost,
	isValidPattern,
	isValidPort,
	OptionsValidator,
	serverOptions,
} from '../src/options.ts';
import type { ServerOptions } from '../src/types.d.ts';
import { errorList } from '../src/utils.ts';

function makeValidChecks(isValidFn: (input: any) => boolean) {
	const msg = (expected: boolean, input: any) => {
		return [
			`Expected to be ${expected ? 'valid' : 'invalid'}:`,
			`${isValidFn.name}(${JSON.stringify(input, null, '\t')})`,
		].join('\n');
	};

	return {
		valid(input: any) {
			expect(isValidFn(input), msg(true, input)).toBe(true);
		},
		invalid(input: any) {
			expect(isValidFn(input), msg(false, input)).toBe(false);
		},
	};
}

function throwError(msg: string) {
	throw new Error(msg);
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
		// bug in node's net.isIP, or actually valid?
		valid('9999.9999.9999.9999.9999');
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
		invalid('.');
		invalid(':');
		invalid('____');
		invalid('with spaces');
		invalid('piña-colada.dev');
		invalid('1.1::1.1');
		invalid('9999.9999:9999::::9999.9999');
		invalid('2001:0zb9::7334');
		invalid('123...4567890...');
		invalid('1::::1::::1::::1');
	});
});

suite('isValidPattern', () => {
	const { valid, invalid } = makeValidChecks(isValidPattern);

	test('accepts any file name', () => {
		valid('README.md');
		valid('  index.html  ');
		valid('Piña Colada! Forever');
	});

	test('accepts patterns prefixed with !', () => {
		valid('!README.md');
		valid('!!!!!!!!!!');
	});

	test('rejects invalid type or empty string', () => {
		invalid(null);
		invalid(1);
		invalid('');
		invalid('!');
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

suite('OptionsValidator', () => {
	test('returns valid values as-is', () => {
		const onError = errorList();
		const val = new OptionsValidator(onError);
		const valid = <T = any>(fn: (input: T) => T, input: T) => {
			const msg = `OptionsValidator.${fn.name}(${JSON.stringify(input)})`;
			expect(fn.call(val, input), msg).toEqual(input);
		};

		valid(val.cors, undefined);
		valid(val.cors, true);
		valid(val.cors, false);

		valid(val.list, undefined);
		valid(val.list, true);
		valid(val.list, false);

		valid(val.gzip, undefined);
		valid(val.gzip, true);
		valid(val.gzip, false);

		valid(val.index, undefined);
		valid(val.index, []);
		valid(val.index, ['a b c', 'Indéx.html']);

		valid(val.exclude, undefined);
		valid(val.exclude, []);
		valid(val.exclude, ['.*', '!.well-known']);
		valid(val.exclude, ['.DS_Store', '_*_**', '!.okay']);

		valid(val.ext, undefined);
		valid(val.ext, []);
		valid(val.ext, ['.html', '.HTM']);
		valid(val.ext, ['.a.b.c.d.e', '.CoolExtension']);

		valid(val.headers, undefined);
		valid(val.headers, []);
		valid(val.headers, [{ include: ['*.html'], headers: { DNT: 1 } }]);
		valid(val.headers, [
			{ headers: { 'x-my-header': 'hello world!!!', 'content-type': 'TEXT/HTML;CHARSET=utf8' } },
		]);

		valid(val.host, undefined);
		valid(val.host, '::1');
		valid(val.host, '127.0.0.1');
		valid(val.host, 'cool-site');
		valid(val.host, 'hello-world.localhost');
		valid(val.host, '01.02.03.04.05.dev');

		valid(val.ports, undefined);
		valid(val.ports, [1]);
		valid(val.ports, [5000, 5001, 5002, 5003, 5004, 5005]);
		valid(val.ports, [10000, 1000, 100, 10, 1]);

		// root validator is a bit stranger: requires a string, and may
		// modify it by calling path.resolve.
		valid(val.root, cwd());

		expect(onError.list).toEqual([]);
	});

	test('sends errors for inputs of incorrect type', () => {
		const val = new OptionsValidator(throwError);

		expect(() => val.cors(null as any)).toThrow(`invalid cors value: null`);
		expect(() => val.index({ hello: 'world' } as any)).toThrow(
			`invalid index value: {"hello":"world"}`,
		);
		expect(() => val.list('yes' as any)).toThrow(`invalid list value: 'yes'`);
		expect(() => val.exclude(new Set(['index']) as any)).toThrow(`invalid exclude pattern: {}`);
		expect(() => val.ext('.html' as any)).toThrow(`invalid ext value: '.html'`);
		expect(() => val.gzip(1 as any)).toThrow(`invalid gzip value: 1`);
		expect(() => val.headers({ dnt: '1' } as any)).toThrow(`invalid header value: {"dnt":"1"}`);
		expect(() => val.host(true as any)).toThrow(`invalid host value: true`);
		expect(() => val.ports(8000 as any)).toThrow(`invalid port value: 8000`);
	});

	test('sends errors for invalid inputs', () => {
		const val = new OptionsValidator(throwError);

		expect(() => val.index(['./index.html'])).toThrow(`invalid index value: './index.html'`);
		expect(() => val.exclude([null] as any)).toThrow(`invalid exclude pattern: null`);
		expect(() => val.exclude(['.*', 'a:b:c'])).toThrow(`invalid exclude pattern: 'a:b:c'`);
		expect(() => val.ext(['.html', 'htm'])).toThrow(`invalid ext value: 'htm'`);
		expect(() => val.headers([{ 'Content-Type': 'text/html' } as any])).toThrow(
			`invalid header value: {"Content-Type":"text/html"}`,
		);
		expect(() => val.headers([{ include: ['*'], headers: {} }])).toThrow(
			`invalid header value: {"include":["*"],"headers":{}}`,
		);
		expect(() => val.headers([{ headers: { 'Bad Header:': 'Whoops' } }])).toThrow(
			`invalid header value: {"headers":{"Bad Header:":"Whoops"}}`,
		);
		expect(() => val.host('Bad Host!')).toThrow(`invalid host value: 'Bad Host!'`);
		expect(() => val.ports([1, 80, 3000, 99_999])).toThrow(`invalid port number: 99999`);
	});
});

suite('serverOptions', () => {
	test('returns default options with empty input', () => {
		const onError = errorList();
		const root = cwd();
		const result = serverOptions({ root }, onError);
		expect(result).toEqual({ root, ...DEFAULT_OPTIONS });
		expect(onError.list).toEqual([]);
	});

	test('preserves valid options', () => {
		const onError = errorList();

		const testOptions1: ServerOptions = {
			root: cwd(),
			list: false,
			gzip: false,
			cors: true,
		};
		expect(serverOptions(testOptions1, onError)).toEqual({
			...DEFAULT_OPTIONS,
			...testOptions1,
		});

		const testOptions2: ServerOptions = {
			root: cwd(),
			ext: ['.htm', '.TXT'],
			index: ['page.md', 'Index Page.html'],
			exclude: ['.htaccess', '*.*.*', '_*'],
			headers: [{ include: ['*.md', '*.html'], headers: { dnt: 1 } }],
			host: '192.168.1.199',
		};
		expect(serverOptions(testOptions2, onError)).toEqual({
			...DEFAULT_OPTIONS,
			...testOptions2,
		});

		expect(onError.list).toEqual([]);
	});

	test('rejects invalid values', () => {
		const onError = errorList();
		const inputs = {
			root: 'this/path/doesnt/exist',
			cors: null,
			exclude: [{}, 'section/*.json', 'a:b:c:d', 'no\\pe'],
			ext: ['html', 'txt', './index.html', '..'],
			gzip: undefined,
			headers: [],
			index: [undefined, 'invalid/value', 'C:\\Temp'],
			list: {},
			host: 'cool.test:3000',
			ports: [0, 100_000],
		};
		const { root, ...result } = serverOptions(
			// @ts-expect-error
			inputs,
			onError,
		);
		expect(root).toBeTypeOf('string');
		expect(Object.keys(result).length).toBeGreaterThanOrEqual(9);
		expect(result).toEqual(DEFAULT_OPTIONS);
	});
});
