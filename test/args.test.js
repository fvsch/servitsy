import { deepStrictEqual, strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import {
	CLIArgs,
	parseArgs,
	parseHeaders,
	parsePort,
	splitOptionValue,
	strToBool,
	unknownArgs,
} from '../lib/args.js';
import { errorList, intRange } from '../lib/utils.js';
import { argify } from './shared.js';

/**
@typedef {import('../lib/types.d.ts').HttpHeaderRule} HttpHeaderRule
*/

suite('CLIArgs', () => {
	test('returns empty values', () => {
		const args = new CLIArgs([]);
		deepStrictEqual(args.data(), {
			map: [],
			list: [],
		});
	});

	test('conserves whitespace not collapsed by shell', () => {
		// we may have whitespace-only strings in process.argv when the shell
		// arguments included quoted strings, e.g.
		// node script.js '' foo '  '
		// process.argv is [
		//   '/path/to/node',
		//   '/path/to/script.js',
		//   '',
		//   'foo',
		//   '  '
		// ]
		deepStrictEqual(new CLIArgs(['']).data(), {
			map: [],
			list: [''],
		});
		deepStrictEqual(new CLIArgs(['', ' ', '']).data(), {
			map: [],
			list: ['', ' ', ''],
		});
	});

	test('treats names starting with 1-2 hyphens as key-value options', () => {
		strictEqual(argify`zero`.has('zero'), false);
		strictEqual(argify`-one`.has('-one'), true);
		strictEqual(argify`--two hello`.has('--two'), true);
		strictEqual(argify`---three hello`.has('---three'), false);
	});

	test('maps option to its value when separated by equal sign', () => {
		strictEqual(argify`-one=value1`.get('-one'), 'value1');
		strictEqual(argify`--two=value2`.get('--two'), 'value2');
	});

	test('maps option to its value when separated by whitespace', () => {
		const args = argify`-one value1 --two value2`;
		strictEqual(args.get('-one'), 'value1');
		strictEqual(args.get('--two'), 'value2');
		deepStrictEqual(args.data().map, [
			['-one', 'value1'],
			['--two', 'value2'],
		]);
	});

	test('can retrieve args with number indexes', () => {
		const args = argify`. --foo --bar baz hello`;
		strictEqual(args.get(0), '.');
		strictEqual(args.get(1), 'hello');
		strictEqual(args.get(2), undefined);
		deepStrictEqual(args.data().list, ['.', 'hello']);
	});

	test('can retrieve mapped args', () => {
		const args = argify`. --foo --bar baz hello -x -test=okay`;
		strictEqual(args.get('--foo'), '');
		strictEqual(args.get('--bar'), 'baz');
		strictEqual(args.get('-x'), '');
		strictEqual(args.get('-test'), 'okay');
	});

	test('last instance of option wins', () => {
		const args = argify`-t=1 -t=2 --test 3 -t 4 --test 5`;
		strictEqual(args.get('-t'), '4');
		strictEqual(args.get('--test'), '5');
		strictEqual(args.get(['--test', '-t']), '5');
		deepStrictEqual(args.all(['-t', '--test']), ['1', '2', '3', '4', '5']);
	});

	test('merges all values for searched options', () => {
		const args = argify`-c config.js -f one.txt --file two.txt -f=three.txt`;
		deepStrictEqual(args.all(['--config', '-c']), ['config.js']);
		deepStrictEqual(args.all(['--file', '-f']), ['one.txt', 'two.txt', 'three.txt']);
	});
});

suite('parseArgs', () => {
	test('no errors for empty args', () => {
		const context = { error: errorList() };
		parseArgs(argify``, context);
		deepStrictEqual(context.error.list, []);
	});

	test('does not validate host and root strings', () => {
		const context = { error: errorList() };
		const args = new CLIArgs(['--host', ' not a hostname!\n', 'https://not-a-valid-root']);
		const options = parseArgs(args, context);
		strictEqual(options.host, 'not a hostname!');
		strictEqual(options.root, 'https://not-a-valid-root');
		deepStrictEqual(context.error.list, []);
	});

	test('validates --port syntax', () => {
		const context = { error: errorList() };
		deepStrictEqual(parseArgs(argify`--port 1000+`, context), {
			ports: intRange(1000, 1009),
		});
		deepStrictEqual(parseArgs(argify`--port +1000`, context), {});
		deepStrictEqual(parseArgs(argify`--port whatever`, context), {});
		deepStrictEqual(parseArgs(argify`--port {"some":"json"}`, context), {});
		deepStrictEqual(context.error.list, [
			`invalid --port value: '+1000'`,
			`invalid --port value: 'whatever'`,
			`invalid --port value: '{"some":"json"}'`,
		]);
	});

	test('accepts valid --header syntax', () => {
		const context = { error: errorList() };
		const getRule = (value = '') =>
			parseArgs(new CLIArgs(['--header', value]), context).headers?.at(0);
		deepStrictEqual(getRule('x-header-1: true'), {
			headers: { 'x-header-1': 'true' },
		});
		deepStrictEqual(getRule('*.md,*.mdown content-type: text/markdown; charset=UTF-8'), {
			include: ['*.md', '*.mdown'],
			headers: { 'content-type': 'text/markdown; charset=UTF-8' },
		});
		deepStrictEqual(getRule('{"good": "json"}'), {
			headers: { good: 'json' },
		});
	});

	test('rejects invalid --header syntax', () => {
		const context = { error: errorList() };
		const getRule = (value = '') => {
			const args = new CLIArgs(['--header', value]);
			return parseArgs(args, context).headers?.at(0);
		};

		strictEqual(getRule('basic string'), undefined);
		strictEqual(getRule('*.md {"bad": [json]}'), undefined);
		deepStrictEqual(context.error.list, [
			`invalid --header value: 'basic string'`,
			`invalid --header value: '*.md {"bad": [json]}'`,
		]);
	});

	test('sets warnings for unknown args', () => {
		const context = { error: errorList() };
		const args = argify`--help --port=9999 --never gonna -GiveYouUp`;
		parseArgs(args, context);
		deepStrictEqual(context.error.list, [
			`unknown option '--never'`,
			`unknown option '-GiveYouUp'`,
		]);
	});
});

suite('parseHeaders', () => {
	/** @type {(input: string, expected: HttpHeaderRule | undefined) => void} */
	const checkHeaders = (input, expected) => {
		const result = parseHeaders(input);
		deepStrictEqual(result, expected);
	};

	test('no header rules for empty inputs', () => {
		checkHeaders('', undefined);
		checkHeaders('     ', undefined);
		checkHeaders('\t\t\n\t\n', undefined);
	});

	test('parses key:value strings', () => {
		checkHeaders('x-header1:value', { headers: { 'x-header1': 'value' } });
		checkHeaders('  X-Header2:   value  ', { headers: { 'X-Header2': 'value' } });
		checkHeaders('* x-header3: value', { headers: { 'x-header3': 'value' } });
		checkHeaders('* HEADER_0001: {{value}}', { headers: { HEADER_0001: '{{value}}' } });

		checkHeaders('a b ,  c\t \td: value', {
			include: ['a b', 'c'],
			headers: { d: 'value' },
		});
		checkHeaders('*.rst, *.rtxt Content-Type: text/x-rst; charset=ISO-8859-1', {
			include: ['*.rst', '*.rtxt'],
			headers: { 'Content-Type': 'text/x-rst; charset=ISO-8859-1' },
		});
	});

	test('parses json values', () => {
		checkHeaders('{"x-header1": "value", "x-header2": true, "x-header-3": 9000}', {
			headers: { 'x-header1': 'value', 'x-header2': 'true', 'x-header-3': '9000' },
		});
		checkHeaders('.*,!.well-known {"HEADER_0001": "{{\\\\///|||}}"}', {
			include: ['.*', '!.well-known'],
			headers: { HEADER_0001: '{{\\///|||}}' },
		});
		checkHeaders('*.html, *.htm, *.shtml {"Content-Type": "text/html;charset=ISO-8859-1"}', {
			include: ['*.html', '*.htm', '*.shtml'],
			headers: { 'Content-Type': 'text/html;charset=ISO-8859-1' },
		});
	});

	test('trim whitespace in header and values, ', () => {
		checkHeaders('    x-hello\t\t: world !\r\n\r\n', {
			headers: { 'x-hello': 'world !' },
		});
		checkHeaders('{"x-space-after  ": "value"}', {
			headers: { 'x-space-after': 'value' },
		});
	});

	test('drops empty headers and/or values', () => {
		checkHeaders(': value', undefined);
		checkHeaders('  \r\n\r\n    : value', undefined);
		checkHeaders('x-header-1: ', undefined);
		checkHeaders('x-header-2: \t\t\t\t', undefined);
		checkHeaders('{"  ": "value1", "x-header-3": ""}', undefined);
	});

	test('does NOT validate header names and values', () => {
		checkHeaders('{"çççç": "value"}', {
			headers: { çççç: 'value' },
		});
		checkHeaders('a b  c\tinval!d=chars: value', {
			include: ['a b  c'],
			headers: { 'inval!d=chars': 'value' },
		});
		checkHeaders('{"x-header": "\\r\\nBRE\\r\\nAK!\\r\\n"}', {
			headers: { 'x-header': 'BRE\r\nAK!' },
		});
	});
});

suite('parsePort', () => {
	test('invalid values return undefined', () => {
		strictEqual(parsePort(''), undefined);
		strictEqual(parsePort('--'), undefined);
		strictEqual(parsePort('hello'), undefined);
		strictEqual(parsePort('9000!'), undefined);
		strictEqual(parsePort('3.1415'), undefined);
		strictEqual(parsePort('3141+5'), undefined);
		strictEqual(parsePort('31415-'), undefined);
	});

	test('accepts a single integer number', () => {
		deepStrictEqual(parsePort('0'), [0]);
		deepStrictEqual(parsePort('10'), [10]);
		deepStrictEqual(parsePort('1337'), [1337]);
		deepStrictEqual(parsePort('65535'), [65_535]);
		deepStrictEqual(parsePort('999999'), [999_999]);
	});

	test(`with format: 'int+'`, () => {
		deepStrictEqual(parsePort('1+'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		const res1 = parsePort('80+');
		strictEqual(res1?.length, 10);
		strictEqual(res1?.at(0), 80);
		strictEqual(res1?.at(-1), 89);
		const res2 = parsePort('1337+');
		strictEqual(res2?.length, 10);
		strictEqual(res2?.at(0), 1337);
		strictEqual(res2?.at(-1), 1346);
	});

	test(`with format: 'int-int'`, () => {
		deepStrictEqual(parsePort('0-5'), [0, 1, 2, 3, 4, 5]);
		deepStrictEqual(parsePort('1000000-1000000'), [1_000_000]);
		deepStrictEqual(parsePort('1337-1333'), [1337, 1336, 1335, 1334, 1333]);
	});

	test('result is limited to 100 numbers', () => {
		const res1 = parsePort('1000-9999');
		strictEqual(res1?.length, 100);
		strictEqual(res1?.at(0), 1000);
		strictEqual(res1?.at(-1), 1099);
		strictEqual(res1?.at(200), undefined);
	});
});

suite('splitOptionValue', () => {
	test('splits string on commas', () => {
		deepStrictEqual(splitOptionValue([]), []);
		deepStrictEqual(splitOptionValue(['hello world']), ['hello world']);
		deepStrictEqual(splitOptionValue([' hello , world ']), ['hello', 'world']);
		deepStrictEqual(splitOptionValue([',,,aaa,,,bbb,,,ccc,,,']), ['aaa', 'bbb', 'ccc']);
	});

	test('flattens split values', () => {
		deepStrictEqual(splitOptionValue(['aaa', 'bbb', 'ccc']), ['aaa', 'bbb', 'ccc']);
		deepStrictEqual(splitOptionValue(['a,b,c', 'd,e,f', '1,2,3']), 'abcdef123'.split(''));
	});

	test('drops empty values', () => {
		deepStrictEqual(splitOptionValue(['', '']), []);
		deepStrictEqual(splitOptionValue(['', ',,,', '']), []);
		deepStrictEqual(splitOptionValue([',,,test,,,']), ['test']);
	});
});

suite('strToBool', () => {
	test('ignores invalid values', () => {
		strictEqual(strToBool(), undefined);
		// @ts-expect-error
		strictEqual(strToBool(true), undefined);
		// @ts-expect-error
		strictEqual(strToBool({}, true), undefined);
	});

	test('matches non-empty strings', () => {
		strictEqual(strToBool('True'), true);
		strictEqual(strToBool(' FALSE '), false);
		strictEqual(strToBool('1'), true);
		strictEqual(strToBool('0'), false);
	});

	test('empty string returns emptyValue', () => {
		strictEqual(strToBool('', true), true);
		strictEqual(strToBool('\t  \t', true), true);
		strictEqual(strToBool('', false), false);
		strictEqual(strToBool('\t  \t', false), false);
	});
});

suite('unknownArgs', () => {
	test('accepts known args', () => {
		const args = argify(`
			--help
			--version
			-h --host
			-p --port
			--header
			--cors --no-cors
			--gzip --no-gzip
			--ext --no-ext
			--dir-file --no-dir-file
			--dir-list --no-dir-list
			--exclude --no-exclude
		`);
		deepStrictEqual(unknownArgs(args), []);
	});

	test('rejects unknown args', () => {
		const someKnown = ['--version', '--host', '--header', '--ext'];
		const unknown = ['-v', '--Host', '--ports', '--headers', '--foobar'];
		const args = new CLIArgs([...unknown, ...someKnown]);
		deepStrictEqual(unknownArgs(args), unknown);
	});
});
