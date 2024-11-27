import { expect, suite, test } from 'vitest';

import { CLIArgs, parseHeaders, parsePort, splitOptionValue, strToBool } from '../src/args.ts';
import type { HttpHeaderRule } from '../src/types.d.ts';
import { errorList, intRange } from '../src/utils.ts';

function arr(strings: string | TemplateStringsArray = '', ...values: string[]) {
	return String.raw({ raw: strings }, ...values)
		.trim()
		.split(/\s+/g);
}

suite('CLIArgs', () => {
	test('returns empty values', () => {
		const args = new CLIArgs([]);
		expect(args.data()).toEqual({
			val: {},
			pos: [],
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
			pos: [''],
			val: {},
		});
		expect(new CLIArgs(['', ' ', '']).data()).toEqual({
			pos: ['', ' ', ''],
			val: {},
		});
	});

	test('single hyphen long values are dropped', () => {
		const args = new CLIArgs(arr`-a -b=okay -cd -ef=nope`);
		expect(args.data()).toEqual({
			val: { a: true, b: true },
			pos: ['okay'],
		});
	});

	test('unspecified options are treated as boolean', () => {
		const args = new CLIArgs(arr`--one value1 --two value2`);
		expect(args.data()).toEqual({
			val: { one: true, two: true },
			pos: ['value1', 'value2'],
		});
	});

	test('can retrieve positional args', () => {
		const args = new CLIArgs(arr`. --one two --three four`);
		expect(args.pos(0)).toBe('.');
		expect(args.pos(1)).toBe('two');
		expect(args.pos(2)).toBe('four');
		expect(args.data()).toEqual({
			val: { one: true, three: true },
			pos: ['.', 'two', 'four'],
		});
	});

	test('known options are mapped with expected type', () => {
		const args = new CLIArgs(arr`
			--help
			--version
			--host long-host.local
			-h short-host.local
			-p 80
			--port 1337+
			--header header1
			--header header2
			--cors
			--gzip
			--ext .html,.htm
			--ext md,mdown
			--dirfile index.html
			--dirfile index.htmlx
			--dirlist
			--exclude .*,*config
			--exclude *rc
		`);
		expect(args.get('unknown')).toBe(undefined);
		expect(args.get('help')).toBe(true);
		expect(args.get('version')).toBe(true);
		expect(args.get('host')).toBe('short-host.local');
		expect(args.get('port')).toBe('1337+');
		expect(args.get('header')).toEqual(['header1', 'header2']);
		expect(args.get('cors')).toBe(true);
		expect(args.get('gzip')).toBe(true);
		expect(args.get('ext')).toEqual(['.html,.htm', 'md,mdown']);
		expect(args.get('dirfile')).toEqual(['index.html', 'index.htmlx']);
		expect(args.get('dirlist')).toBe(true);
		expect(args.get('exclude')).toEqual(['.*,*config', '*rc']);
	});

	test('bool accessor only returns booleans', () => {
		const args = new CLIArgs(arr`
			--cors
			--dirlist
			--ext html
			--port true
		`);
		// specified and configured as boolean
		expect(args.bool('cors')).toBe(true);
		expect(args.bool('dirlist')).toBe(true);
		// configured as boolean but not specified
		expect(args.bool('gzip')).toBe(undefined);
		// not configured as boolean
		expect(args.bool('ext')).toBe(undefined);
		expect(args.bool('port')).toBe(undefined);
	});

	test('bool accessor returns false for --no- prefix', () => {
		const args = new CLIArgs(arr`
			--no-cors
			--no-dirlist
			--no-gzip
		`);
		expect(args.bool('cors')).toBe(false);
		expect(args.bool('dirlist')).toBe(false);
		expect(args.bool('gzip')).toBe(false);
	});

	test('str accessor only returns strings', () => {
		const args = new CLIArgs(arr`
			--port 123456789
			--host localhost --host localesthost
			--dirfile index.html
			--ext html
			--random value1
		`);
		// specified and configured as string
		expect(args.str('port')).toBe('123456789');
		expect(args.str('host')).toBe('localesthost');
		// configured as multiple strings
		expect(args.str('dirfile')).toBe(undefined);
		expect(args.str('ext')).toBe(undefined);
		// not configured, defaults to boolean
		expect(args.str('random')).toBe(undefined);
	});

	test('str accessor returns undefined for --no- prefix', () => {
		const args = new CLIArgs(arr`
			--no-host
			--host local1 -h local2
			--port 1234 --no-port
			--ports 5678 --no-ports
		`);
		expect(args.str('host')).toBe(undefined);
		expect(args.str('port')).toBe(undefined);
		expect(args.str('ports')).toBe(undefined);
	});

	test('list accessor only returns arrays', () => {
		const args = new CLIArgs(arr`
			--dirfile 404.html
			--ext red --ext green --ext blue
			--header h1 --header h2
			--headers h3 --headers h4
			--host host1 --host host2
			--random value1 --random value2
		`);
		expect(args.list('dirfile')).toEqual(['404.html']);
		expect(args.list('ext')).toEqual(['red', 'green', 'blue']);
		expect(args.list('header')).toEqual(['h1', 'h2']);
		expect(args.list('headers')).toEqual(['h3', 'h4']);
		expect(args.list('host')).toBe(undefined);
		expect(args.list('random')).toBe(undefined);
	});

	test('list accessor returns empty array for --no- prefix', () => {
		const args = new CLIArgs(arr`
			--dirfile 404.html
			--no-dirfile
			--no-exclude
			--exclude !*.md --exclude .DS_Store
			--ext .html --ext .htm
			--no-ext
			--no-header
			--no-headers
			--header h1 --header h2
			--headers h3 --headers h4
		`);
		expect(args.list('dirfile')).toEqual([]);
		expect(args.list('exclude')).toEqual([]);
		expect(args.list('ext')).toEqual([]);
		expect(args.list('header')).toEqual([]);
		expect(args.list('headers')).toEqual([]);
	});

	test('splitList accessor parses comma-separated lists', () => {
		const args = new CLIArgs(arr`
			--dirfile index.html,index.htmlx
			--dirfile page.html,page.htmlx
			--ext .html
			--ext a,b,,,,c,,d
		`);
		expect(args.splitList('dirfile')).toEqual([
			'index.html',
			'index.htmlx',
			'page.html',
			'page.htmlx',
		]);
		expect(args.splitList('ext')).toEqual(['.html', 'a', 'b', 'c', 'd']);
	});
});

suite('CLIArgs.options', () => {
	test('no errors for empty args', () => {
		const error = errorList();
		const options = new CLIArgs([]).options(error);
		expect(options).toEqual({});
		expect(error.list).toEqual([]);
	});

	test('parses boolean args', () => {
		const error = errorList();
		const noArgs = new CLIArgs([]);
		expect(noArgs.options(error)).toEqual({});
		const posArgs = new CLIArgs(arr`--cors --gzip --dirlist`);
		expect(posArgs.options(error)).toEqual({ cors: true, gzip: true, dirList: true });
		const negArgs = new CLIArgs(arr`--no-cors --no-gzip --no-dirlist`);
		expect(negArgs.options(error)).toEqual({ cors: false, gzip: false, dirList: false });
		expect(error.list).toEqual([]);
	});

	test('does not validate host and root strings', () => {
		const error = errorList();
		const args = new CLIArgs(['--host', ' not a hostname!\n', 'https://not-a-valid-root']);
		const options = args.options(error);
		expect(options.host).toBe('not a hostname!');
		expect(options.root).toBe('https://not-a-valid-root');
		expect(error.list).toEqual([]);
	});

	test('parses --dirfile as a string list', () => {
		const error = errorList();
		const single = new CLIArgs(arr`--dirfile index.html`);
		expect(single.options(error)).toEqual({ dirFile: ['index.html'] });
		const multiple = new CLIArgs(arr`
			--dirfile index.html,index.htm
			--dirfile page.html,page.htm
		`);
		expect(multiple.options(error)).toEqual({
			dirFile: ['index.html', 'index.htm', 'page.html', 'page.htm'],
		});
		expect(error.list).toEqual([]);
	});

	test('parses --exclude as a string list', () => {
		const error = errorList();
		const single = new CLIArgs(arr`--exclude *.md`);
		expect(single.options(error)).toEqual({ exclude: ['*.md'] });
		const multiple = new CLIArgs(arr`
			--exclude .*,!.well-known
			--exclude _*
			--exclude *.yml,*.yaml
			--exclude package*.json
		`);
		expect(multiple.options(error)).toEqual({
			exclude: ['.*', '!.well-known', '_*', '*.yml', '*.yaml', 'package*.json'],
		});
		expect(error.list).toEqual([]);
	});

	test('parses --ext as list', () => {
		const error = errorList();
		const extOption = new CLIArgs(arr`--ext .html --ext htm --ext json`).options(error);
		expect(extOption).toEqual({ ext: ['.html', '.htm', '.json'] });
		expect(error.list).toEqual([]);
	});

	test('lists accept negative option', () => {
		const error = errorList();
		const args = new CLIArgs(arr`
			--no-exclude
			--no-ext --ext html
			--dirfile index.html --no-dirfile
		`);
		expect(args.options(error)).toEqual({ ext: [], dirFile: [], exclude: [] });
		expect(error.list).toEqual([]);
	});

	test('validates --port syntax', () => {
		const error = errorList();
		const options = (str = '') => {
			const args = new CLIArgs(arr(str));
			return args.options(error);
		};
		expect(options(`--port 1000+`)).toEqual({ ports: intRange(1000, 1009) });
		expect(options(`--port +1000`)).toEqual({});
		expect(options(`--port whatever`)).toEqual({});
		expect(options(`--port {"some":"json"}`)).toEqual({});
		expect(error.list).toEqual([
			`invalid --port value: '+1000'`,
			`invalid --port value: 'whatever'`,
			`invalid --port value: '{"some":"json"}'`,
		]);
	});

	test('accepts valid --header syntax', () => {
		const error = errorList();
		const rule = (value: string) => {
			return new CLIArgs(['--header', value]).options(error).headers?.at(0);
		};
		expect(rule('x-header-1: true')).toEqual({
			headers: { 'x-header-1': 'true' },
		});
		expect(rule('*.md,*.mdown content-type: text/markdown; charset=UTF-8')).toEqual({
			include: ['*.md', '*.mdown'],
			headers: { 'content-type': 'text/markdown; charset=UTF-8' },
		});
		expect(rule('{"good": "json"}')).toEqual({
			headers: { good: 'json' },
		});
		expect(error.list).toEqual([]);
	});

	test('rejects invalid --header syntax', () => {
		const error = errorList();
		const rule = (value: string) => {
			return new CLIArgs(['--header', value]).options(error).headers?.at(0);
		};

		expect(rule('basic string')).toBe(undefined);
		expect(rule('*.md {"bad": [json]}')).toBe(undefined);
		expect(error.list).toEqual([
			`invalid --header value: 'basic string'`,
			`invalid --header value: '*.md {"bad": [json]}'`,
		]);
	});

	test('sets warnings for unknown args', () => {
		const error = errorList();
		new CLIArgs(`--help --port=9999 --never gonna -GiveYouUp`.split(' ')).options(error);
		expect(error.list).toEqual([`unknown option '--never'`, `unknown option '-GiveYouUp'`]);
	});
});

suite('CLIArgs.unknown', () => {
	test('accepts known args', () => {
		const args = new CLIArgs(arr`
			--help
			--version
			-h --host
			-p --port --ports
			--header --headers
			--cors --no-cors
			--gzip --no-gzip
			--ext --no-ext
			--dirfile --no-dirfile
			--dirlist --no-dirlist
			--exclude --no-exclude
		`);
		expect(args.unknown()).toEqual([]);
	});

	test('rejects unknown args', () => {
		const known = ['--version', '--host', '--ports', '--header', '--ext'];
		const unknown = ['-v', '--Host', '--hosts', '--foobar', '--gz', '-gzip'];
		expect(new CLIArgs([...known, ...unknown]).unknown()).toEqual(unknown);
	});
});

suite('parseHeaders', () => {
	const $header = (input: string, expected?: HttpHeaderRule) => {
		expect(parseHeaders(input)).toEqual(expected);
	};

	test('no header rules for empty inputs', () => {
		$header('', undefined);
		$header('     ', undefined);
		$header('\t\t\n\t\n', undefined);
	});

	test('parses key:value strings', () => {
		$header('x-header1:value', { headers: { 'x-header1': 'value' } });
		$header('  X-Header2:   value  ', { headers: { 'X-Header2': 'value' } });
		$header('* x-header3: value', { headers: { 'x-header3': 'value' } });
		$header('* HEADER_0001: {{value}}', { headers: { HEADER_0001: '{{value}}' } });

		$header('a b ,  c\t \td: value', {
			include: ['a b', 'c'],
			headers: { d: 'value' },
		});
		$header('*.rst, *.rtxt Content-Type: text/x-rst; charset=ISO-8859-1', {
			include: ['*.rst', '*.rtxt'],
			headers: { 'Content-Type': 'text/x-rst; charset=ISO-8859-1' },
		});
	});

	test('parses json values', () => {
		$header('{"x-header1": "value", "x-header2": true, "x-header-3": 9000}', {
			headers: { 'x-header1': 'value', 'x-header2': 'true', 'x-header-3': '9000' },
		});
		$header('.*,!.well-known {"HEADER_0001": "{{\\\\///|||}}"}', {
			include: ['.*', '!.well-known'],
			headers: { HEADER_0001: '{{\\///|||}}' },
		});
		$header('*.html, *.htm, *.shtml {"Content-Type": "text/html;charset=ISO-8859-1"}', {
			include: ['*.html', '*.htm', '*.shtml'],
			headers: { 'Content-Type': 'text/html;charset=ISO-8859-1' },
		});
	});

	test('trim whitespace in header and values, ', () => {
		$header('    x-hello\t\t: world !\r\n\r\n', {
			headers: { 'x-hello': 'world !' },
		});
		$header('{"x-space-after  ": "value"}', {
			headers: { 'x-space-after': 'value' },
		});
	});

	test('drops empty headers and/or values', () => {
		$header(': value', undefined);
		$header('  \r\n\r\n    : value', undefined);
		$header('x-header-1: ', undefined);
		$header('x-header-2: \t\t\t\t', undefined);
		$header('{"  ": "value1", "x-header-3": ""}', undefined);
	});

	test('does NOT validate header names and values', () => {
		$header('{"çççç": "value"}', {
			headers: { çççç: 'value' },
		});
		$header('a b  c\tinval!d=chars: value', {
			include: ['a b  c'],
			headers: { 'inval!d=chars': 'value' },
		});
		$header('{"x-header": "\\r\\nBRE\\r\\nAK!\\r\\n"}', {
			headers: { 'x-header': 'BRE\r\nAK!' },
		});
	});
});

suite('parsePort', () => {
	const $port = (input: string, expected?: number[]) => {
		expect(parsePort(input)).toEqual(expected);
	};

	test('invalid values return undefined', () => {
		$port('', undefined);
		$port('--', undefined);
		$port('hello', undefined);
		$port('9000!', undefined);
		$port('3.1415', undefined);
		$port('3141+5', undefined);
		$port('31415-', undefined);
	});

	test('accepts a single integer number', () => {
		$port('0', [0]);
		$port('10', [10]);
		$port('1337', [1337]);
		$port('65535', [65_535]);
		$port('999999', [999_999]);
	});

	test(`with format: 'int+'`, () => {
		$port('1+', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

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
		$port('0-5', [0, 1, 2, 3, 4, 5]);
		$port('1000000-1000000', [1_000_000]);
		$port('1337-1333', [1337, 1336, 1335, 1334, 1333]);
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
	const $split = (input: string[], expected: string[]) => {
		expect(splitOptionValue(input)).toEqual(expected);
	};

	test('splits string on commas', () => {
		$split([], []);
		$split(['hello world'], ['hello world']);
		$split([' hello , world '], ['hello', 'world']);
		$split([',,,aaa,,,bbb,,,ccc,,,'], ['aaa', 'bbb', 'ccc']);
	});

	test('flattens split values', () => {
		$split(['aaa', 'bbb', 'ccc'], ['aaa', 'bbb', 'ccc']);
		$split(['a,b,c', 'd,e,f', '1,2,3'], 'abcdef123'.split(''));
	});

	test('drops empty values', () => {
		$split(['', ''], []);
		$split(['', ',,,', ''], []);
		$split([',,,test,,,'], ['test']);
	});
});

suite('strToBool', () => {
	test('ignores invalid values', () => {
		expect(strToBool()).toBe(undefined);
		expect(strToBool(true as any)).toBe(undefined);
		expect(strToBool({} as any, true)).toBe(undefined);
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
