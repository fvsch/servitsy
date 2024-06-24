import { deepStrictEqual, match, strictEqual } from 'node:assert';
import { cwd } from 'node:process';
import { suite, test } from 'node:test';

import { errorsContext } from '../lib/logger.js';
import {
	serverOptions,
	validateArgPresence,
	validateCors,
	validateDirFile,
	validateDirList,
	validateExclude,
	validateExt,
	validateHost,
	validatePorts,
	validateRoot,
} from '../lib/options.js';
import { argify } from './args.test.js';

/**
@type {(mode: 'arg' | 'option') => import('../lib/options.js').ValidationContext}
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
