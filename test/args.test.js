import { deepStrictEqual, strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { CLIArgs } from '../lib/args.js';
import { argify } from './shared.js';

suite('CLIArgs', () => {
	test('returns empty values', () => {
		const args = new CLIArgs([]);
		deepStrictEqual(args.data, {
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
		deepStrictEqual(new CLIArgs(['']).data, {
			map: [],
			list: [''],
		});
		deepStrictEqual(new CLIArgs(['', ' ', '']).data, {
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
		deepStrictEqual(args.data.map, [
			['-one', 'value1'],
			['--two', 'value2'],
		]);
	});

	test('can retrieve args with number indexes', () => {
		const args = argify`. --foo --bar baz hello`;
		strictEqual(args.get(0), '.');
		strictEqual(args.get(1), 'hello');
		strictEqual(args.get(2), undefined);
		deepStrictEqual(args.data.list, ['.', 'hello']);
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
