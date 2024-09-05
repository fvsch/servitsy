import { deepStrictEqual, match, strictEqual } from 'node:assert';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { suite, test } from 'node:test';

import {
	serverOptions,
	validateArgPresence,
	validateCors,
	validateDirFile,
	validateDirList,
	validateExclude,
	validateExt,
	validateHeaders,
	validateHost,
	validatePorts,
	validateRoot,
} from '../lib/options.js';
import { errorsContext } from '../lib/utils.js';
import { argify } from './shared.js';

/**
@typedef {import('../lib/types.js').HttpHeaderRule} HttpHeaderRule
@typedef {import('../lib/options.js').ValidationContext} ValidationContext
**/

/**
@type {(mode: 'arg' | 'option') => ValidationContext}
*/
function validationContext(mode) {
	return { mode, ...errorsContext() };
}

const hostWildcardPattern = /^(::|0\.0\.0\.0)$/;
const defaultPorts = [8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089];

suite('serverOptions', () => {
	test('default options (option mode)', () => {
		const { errors, options } = serverOptions({
			root: cwd(),
		});
		strictEqual(options.root, cwd());
		match(options.host, hostWildcardPattern);
		deepStrictEqual(options.ports, [defaultPorts[0]]);
		deepStrictEqual(errors, []);
	});

	test('default options (arg mode)', () => {
		const { errors, options } = serverOptions({}, argify(''));
		strictEqual(options.root, cwd());
		match(options.host, hostWildcardPattern);
		deepStrictEqual(options.ports, defaultPorts);
		deepStrictEqual(errors, []);
	});
});

suite('validateArgPresence', () => {
	test('no errors for empty args', () => {
		const context = validationContext('arg');
		validateArgPresence(argify(''), context);
		deepStrictEqual(context.errors, []);
	});

	test('has warnings for unknown args', () => {
		const args = argify`--help --port=9999 -never gonna --GIVE_YOU_UP`;
		const context = validationContext('arg');
		validateArgPresence(args, context);
		deepStrictEqual(context.errors, [
			{ warn: `unknown option '-never'` },
			{ warn: `unknown option '--GIVE_YOU_UP'` },
		]);
	});
});

suite('validateCors', () => {
	test('default is false', () => {
		const context = validationContext('arg');
		strictEqual(validateCors(undefined, context), false);
		deepStrictEqual(context.errors, []);
	});

	test('parses boolean-like arg values', () => {
		const context = validationContext('arg');
		strictEqual(validateCors('', context), true);
		strictEqual(validateCors('true', context), true);
		strictEqual(validateCors('1', context), true);
		strictEqual(validateCors('false', context), false);
		strictEqual(validateCors('0', context), false);
		deepStrictEqual(context.errors, []);
	});

	test('rejects invalid strings', () => {
		const context = validationContext('arg');
		validateCors('yes', context);
		validateCors('NO', context);
		validateCors('access-control-allow-origin:*', context);
		deepStrictEqual(context.errors, [
			{ warn: "invalid --cors value: 'yes'" },
			{ warn: "invalid --cors value: 'NO'" },
			{ warn: "invalid --cors value: 'access-control-allow-origin:*'" },
		]);
	});
});

suite('validateHeaders', () => {
	/** @type {(context: ValidationContext) => (input: string, expected: HttpHeaderRule) => void} */
	const getCheckHeaders = (context) => {
		return (input = '', expected) => {
			const result = validateHeaders([input], context).at(0);
			deepStrictEqual(result, expected);
		};
	};

	test('no header rules for empty inputs', () => {
		const context = validationContext('arg');
		const headers1 = validateHeaders([], context);
		const headers2 = validateHeaders(
			// @ts-expect-error
			[undefined, null, '', '\t\t\n\t\n', {}, []],
			context,
		);
		deepStrictEqual(headers1, []);
		deepStrictEqual(headers2, []);
		deepStrictEqual(context.errors, []);
	});

	test('parses key:value strings', () => {
		const context = validationContext('arg');
		const checkHeaders = getCheckHeaders(context);

		checkHeaders('x-header1:value', {
			headers: { 'x-header1': 'value' },
		});

		checkHeaders('  X-Header2:   value  ', {
			headers: { 'X-Header2': 'value' },
		});

		checkHeaders('* x-header3: value', {
			headers: { 'x-header3': 'value' },
		});

		checkHeaders('a b ,  c\t \td: value', {
			include: ['a b', 'c'],
			headers: { d: 'value' },
		});

		checkHeaders('* HEADER_0001: {{value}}', {
			headers: { HEADER_0001: '{{value}}' },
		});

		checkHeaders('*.rst, *.rtxt Content-Type: text/x-rst; charset=ISO-8859-1', {
			include: ['*.rst', '*.rtxt'],
			headers: { 'Content-Type': 'text/x-rst; charset=ISO-8859-1' },
		});

		deepStrictEqual(context.errors, []);
	});

	test('parses json values', () => {
		const context = validationContext('arg');
		const checkHeaders = getCheckHeaders(context);

		checkHeaders('{"x-header1": "value", "x-header2": true}', {
			headers: { 'x-header1': 'value', 'x-header2': 'true' },
		});

		checkHeaders('{   "x-header3":    "  json syntax keeps whitespace  " }', {
			headers: { 'x-header3': '  json syntax keeps whitespace  ' },
		});

		checkHeaders('.*,!.well-known {"HEADER_0001": "{{\\\\///|||}}"}', {
			include: ['.*', '!.well-known'],
			headers: { HEADER_0001: '{{\\///|||}}' },
		});

		checkHeaders('*.html, *.htm, *.shtml {"Content-Type": "text/html;charset=ISO-8859-1"}', {
			include: ['*.html', '*.htm', '*.shtml'],
			headers: { 'Content-Type': 'text/html;charset=ISO-8859-1' },
		});

		deepStrictEqual(context.errors, []);
	});

	test('rejects invalid header names', () => {
		const context = validationContext('arg');

		const rules = validateHeaders(
			[
				': value',
				'a b  c\tinval!d=chars: value',
				'{"çççç": "value"}',
				'{"  ": "value"}',
				'{"space-after ": "value"}',
			],
			context,
		);

		deepStrictEqual(rules, []);
		deepStrictEqual(context.errors, [
			{ warn: `invalid --header value: ': value'` },
			{
				error: `invalid --header value: {"headers":{"inval!d=chars":"value"},"include":["a b  c"]}`,
			},
			{ error: `invalid --header value: {"headers":{"çççç":"value"}}` },
			{ error: `invalid --header value: {"headers":{"  ":"value"}}` },
			{ error: `invalid --header value: {"headers":{"space-after ":"value"}}` },
		]);
	});

	test('rejects invalid headers rules', () => {
		const context = validationContext('option');
		const inputs = [
			'x-custom: not valid',
			{ is: { not: 'valid' } },
			{ headers: {} },
			{ headers: { 'x-h1': 1 } },
			{ headers: { 'x-h2': true } },
			{ include: true, headers: {} },
		];
		const rules = validateHeaders(
			// @ts-expect-error
			inputs,
			context,
		);
		deepStrictEqual(rules, []);
		deepStrictEqual(
			context.errors,
			inputs.map((value) => ({
				error: `invalid headers value: ${JSON.stringify(value)}`,
			})),
		);
	});
});

suite('validateHost', () => {
	test('with no input, returns a wildcard host', () => {
		const context = validationContext('option');
		const defaultHost = validateHost(undefined, context);
		match(defaultHost, hostWildcardPattern);
		deepStrictEqual(context.errors, []);
	});
});

suite('validatePorts', () => {
	/** @type {import('../lib/constants.js').PortsConfig} */
	const defaultConfig = {
		initial: defaultPorts[0],
		count: defaultPorts.length,
	};
	const argContext = (config = defaultConfig) => ({
		...validationContext('arg'),
		config,
	});
	const optContext = (config = defaultConfig) => ({
		...validationContext('option'),
		config,
	});

	const defaultError = (input = '') => ({
		error: `invalid option --port='${input}'`,
	});

	test('returns the default port when no value is provided', () => {
		const context = argContext();
		deepStrictEqual(validatePorts(undefined, context), defaultPorts);
		deepStrictEqual(context.errors, []);
	});

	test('returns an error when passing an empty string', () => {
		const context = argContext();
		deepStrictEqual(validatePorts('', context), defaultPorts);
		deepStrictEqual(context.errors, [defaultError()]);
	});

	test('rejects invalid formats', () => {
		for (const input of ['invalid', ':1234', '-1234', '3.14', '8000,8001']) {
			const context = argContext();
			validatePorts(input, context);
			deepStrictEqual(context.errors, [defaultError(input)]);
		}
	});

	test('accepts a single number', () => {
		deepStrictEqual(validatePorts('1', argContext()), [1]);
		deepStrictEqual(validatePorts('80', argContext()), [80]);
		deepStrictEqual(validatePorts('3456', argContext()), [3456]);
		deepStrictEqual(validatePorts('8080', argContext()), [8080]);
	});

	test('rejects out-of-range numbers', () => {
		for (const input of ['0', '65536', '999999']) {
			const context = argContext();
			validatePorts(input, context);
			deepStrictEqual(context.errors, [
				{ error: `--port '${input}' is out of allowed range (1–65535)` },
			]);
		}
	});

	test('generates a range for number followed by plus sign', () => {
		const defaultCount = validatePorts('3000+', argContext());
		strictEqual(defaultCount.length, 10);
		strictEqual(`${defaultCount.at(0)}-${defaultCount.at(-1)}`, '3000-3009');

		const customCount = validatePorts('1234+', argContext({ initial: 5000, count: 5 }));
		deepStrictEqual(customCount, [1234, 1235, 1236, 1237, 1238]);
	});

	test('generates a range between two numbers', () => {
		// flat range
		deepStrictEqual(validatePorts('80-80', argContext()), [80]);
		// ascending range
		deepStrictEqual(validatePorts('80-85', argContext()), [80, 81, 82, 83, 84, 85]);
		// descending range
		deepStrictEqual(validatePorts('85-80', argContext()), [85, 84, 83, 82, 81, 80]);
	});

	test('restricts ranges to a max count', () => {
		const excessiveRange = validatePorts('1000-2000', argContext());
		strictEqual(excessiveRange.length, 100);
		strictEqual(excessiveRange.at(-1), 1099);

		const excessiveCount = validatePorts('8000+', argContext({ initial: 5000, count: 1000 }));
		strictEqual(excessiveCount.length, 100);
		strictEqual(excessiveCount.at(-1), 8099);
	});
});

suite('validateRoot', () => {
	test('resolves from cwd', () => {
		const context = validationContext('arg');
		strictEqual(validateRoot('.', context), cwd());
		strictEqual(validateRoot('lib', context), join(cwd(), 'lib'));
	});
});
