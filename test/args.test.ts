import { expect, suite, test } from 'vitest';

import {
	CLIArgs,
	parseArgs,
	parseHeaders,
	parsePort,
	splitOptionValue,
	strToBool,
	unknownArgs,
} from '#src/args.js';
import { errorList, intRange } from '#src/utils.js';
import type { HttpHeaderRule } from '#types';

import { argify } from './shared.js';

suite('CLIArgs', () => {
	test('returns empty values', () => {
		const args = new CLIArgs([]);
		expect(args.data()).toEqual({
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
		expect(new CLIArgs(['']).data()).toEqual({
			map: [],
			list: [''],
		});
		expect(new CLIArgs(['', ' ', '']).data()).toEqual({
			map: [],
			list: ['', ' ', ''],
		});
	});

	test('treats names starting with 1-2 hyphens as key-value options', () => {
		expect(argify`zero`.has('zero')).toBe(false);
		expect(argify`-one`.has('-one')).toBe(true);
		expect(argify`--two hello`.has('--two')).toBe(true);
		expect(argify`---three hello`.has('---three')).toBe(false);
	});

	test('maps option to its value when separated by equal sign', () => {
		expect(argify`-one=value1`.get('-one')).toBe('value1');
		expect(argify`--two=value2`.get('--two')).toBe('value2');
	});

	test('maps option to its value when separated by whitespace', () => {
		const args = argify`-one value1 --two value2`;
		expect(args.get('-one')).toBe('value1');
		expect(args.get('--two')).toBe('value2');
		expect(args.data().map).toEqual([
			['-one', 'value1'],
			['--two', 'value2'],
		]);
	});

	test('can retrieve args with number indexes', () => {
		const args = argify`. --foo --bar baz hello`;
		expect(args.get(0)).toBe('.');
		expect(args.get(1)).toBe('hello');
		expect(args.get(2)).toBe(undefined);
		expect(args.data().list).toEqual(['.', 'hello']);
	});

	test('can retrieve mapped args', () => {
		const args = argify`. --foo --bar baz hello -x -test=okay`;
		expect(args.get('--foo')).toBe('');
		expect(args.get('--bar')).toBe('baz');
		expect(args.get('-x')).toBe('');
		expect(args.get('-test')).toBe('okay');
	});

	test('last instance of option wins', () => {
		const args = argify`-t=1 -t=2 --test 3 -t 4 --test 5`;
		expect(args.get('-t')).toBe('4');
		expect(args.get('--test')).toBe('5');
		expect(args.get(['--test', '-t'])).toBe('5');
		expect(args.all(['-t', '--test'])).toEqual(['1', '2', '3', '4', '5']);
	});

	test('merges all values for searched options', () => {
		const args = argify`-c config.js -f one.txt --file two.txt -f=three.txt`;
		expect(args.all(['--config', '-c'])).toEqual(['config.js']);
		expect(args.all(['--file', '-f'])).toEqual(['one.txt', 'two.txt', 'three.txt']);
	});
});

suite('parseArgs', () => {
	test('no errors for empty args', () => {
		const onError = errorList();
		parseArgs(new CLIArgs([]), { onError });
		expect(onError.list).toEqual([]);
	});

	test('does not validate host and root strings', () => {
		const onError = errorList();
		const args = new CLIArgs(['--host', ' not a hostname!\n', 'https://not-a-valid-root']);
		const options = parseArgs(args, { onError });
		expect(options.host).toBe('not a hostname!');
		expect(options.root).toBe('https://not-a-valid-root');
		expect(onError.list).toEqual([]);
	});

	test('validates --port syntax', () => {
		const onError = errorList();
		const parse = (str = '') => parseArgs(argify(str), { onError });
		expect(parse(`--port 1000+`)).toEqual({ ports: intRange(1000, 1009) });
		expect(parse(`--port +1000`)).toEqual({});
		expect(parse(`--port whatever`)).toEqual({});
		expect(parse(`--port {"some":"json"}`)).toEqual({});
		expect(onError.list).toEqual([
			`invalid --port value: '+1000'`,
			`invalid --port value: 'whatever'`,
			`invalid --port value: '{"some":"json"}'`,
		]);
	});

	test('accepts valid --header syntax', () => {
		const onError = errorList();
		const getRule = (value = '') =>
			parseArgs(new CLIArgs(['--header', value]), { onError }).headers?.at(0);
		expect(getRule('x-header-1: true')).toEqual({
			headers: { 'x-header-1': 'true' },
		});
		expect(getRule('*.md,*.mdown content-type: text/markdown; charset=UTF-8')).toEqual({
			include: ['*.md', '*.mdown'],
			headers: { 'content-type': 'text/markdown; charset=UTF-8' },
		});
		expect(getRule('{"good": "json"}')).toEqual({
			headers: { good: 'json' },
		});
	});

	test('rejects invalid --header syntax', () => {
		const onError = errorList();
		const getRule = (value = '') => {
			const args = new CLIArgs(['--header', value]);
			return parseArgs(args, { onError }).headers?.at(0);
		};

		expect(getRule('basic string')).toBe(undefined);
		expect(getRule('*.md {"bad": [json]}')).toBe(undefined);
		expect(onError.list).toEqual([
			`invalid --header value: 'basic string'`,
			`invalid --header value: '*.md {"bad": [json]}'`,
		]);
	});

	test('sets warnings for unknown args', () => {
		const onError = errorList();
		const args = argify`--help --port=9999 --never gonna -GiveYouUp`;
		parseArgs(args, { onError });
		expect(onError.list).toEqual([`unknown option '--never'`, `unknown option '-GiveYouUp'`]);
	});
});

suite('parseHeaders', () => {
	const checkHeaders = (input: string, expected?: HttpHeaderRule) => {
		expect(parseHeaders(input)).toEqual(expected);
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
	const checkPort = (input: string, expected?: number[]) => {
		expect(parsePort(input)).toEqual(expected);
	};

	test('invalid values return undefined', () => {
		checkPort('', undefined);
		checkPort('--', undefined);
		checkPort('hello', undefined);
		checkPort('9000!', undefined);
		checkPort('3.1415', undefined);
		checkPort('3141+5', undefined);
		checkPort('31415-', undefined);
	});

	test('accepts a single integer number', () => {
		checkPort('0', [0]);
		checkPort('10', [10]);
		checkPort('1337', [1337]);
		checkPort('65535', [65_535]);
		checkPort('999999', [999_999]);
	});

	test(`with format: 'int+'`, () => {
		checkPort('1+', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		const res1 = parsePort('80+');
		expect(res1?.length).toBe(10);
		expect(res1?.at(0)).toBe(80);
		expect(res1?.at(-1)).toBe(89);

		const res2 = parsePort('1337+');
		expect(res2?.length).toBe(10);
		expect(res2?.at(0)).toBe(1337);
		expect(res2?.at(-1)).toBe(1346);
	});

	test(`with format: 'int-int'`, () => {
		checkPort('0-5', [0, 1, 2, 3, 4, 5]);
		checkPort('1000000-1000000', [1_000_000]);
		checkPort('1337-1333', [1337, 1336, 1335, 1334, 1333]);
	});

	test('result is limited to 100 numbers', () => {
		const res1 = parsePort('1000-9999') ?? [];
		expect(res1.length).toBe(100);
		expect(res1.at(0)).toBe(1000);
		expect(res1.at(-1)).toBe(1099);
		expect(res1.at(200)).toBe(undefined);
	});
});

suite('splitOptionValue', () => {
	const checkSplit = (input: string[], expected: string[]) => {
		expect(splitOptionValue(input)).toEqual(expected);
	};

	test('splits string on commas', () => {
		checkSplit([], []);
		checkSplit(['hello world'], ['hello world']);
		checkSplit([' hello , world '], ['hello', 'world']);
		checkSplit([',,,aaa,,,bbb,,,ccc,,,'], ['aaa', 'bbb', 'ccc']);
	});

	test('flattens split values', () => {
		checkSplit(['aaa', 'bbb', 'ccc'], ['aaa', 'bbb', 'ccc']);
		checkSplit(['a,b,c', 'd,e,f', '1,2,3'], 'abcdef123'.split(''));
	});

	test('drops empty values', () => {
		checkSplit(['', ''], []);
		checkSplit(['', ',,,', ''], []);
		checkSplit([',,,test,,,'], ['test']);
	});
});

suite('strToBool', () => {
	test('ignores invalid values', () => {
		expect(strToBool()).toBe(undefined);
		expect(
			// @ts-expect-error
			strToBool(true),
		).toBe(undefined);
		expect(
			// @ts-expect-error
			strToBool({}, true),
		).toBe(undefined);
	});

	test('matches non-empty strings', () => {
		expect(strToBool('True')).toBe(true);
		expect(strToBool(' FALSE ')).toBe(false);
		expect(strToBool('1')).toBe(true);
		expect(strToBool('0')).toBe(false);
	});

	test('empty string returns emptyValue', () => {
		expect(strToBool('', true)).toBe(true);
		expect(strToBool('\t  \t', true)).toBe(true);
		expect(strToBool('', false)).toBe(false);
		expect(strToBool('\t  \t', false)).toBe(false);
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
		expect(unknownArgs(args)).toEqual([]);
	});

	test('rejects unknown args', () => {
		const someKnown = ['--version', '--host', '--header', '--ext'];
		const unknown = ['-v', '--Host', '--ports', '--headers', '--foobar'];
		const args = new CLIArgs([...unknown, ...someKnown]);
		expect(unknownArgs(args)).toEqual(unknown);
	});
});
