import { deepStrictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { fileHeaders } from '../lib/server.js';

/**
 * @typedef {import('../lib/types.js').HttpHeaderRule} HttpHeaderRule
 */

suite('fileHeaders', () => {
	const baseOptions = { cors: false, headers: [] };

	test('no headers for empty/default values', () => {
		deepStrictEqual(fileHeaders(null, baseOptions), {});
	});

	test('sets content-type header when filePath is not null', () => {
		deepStrictEqual(fileHeaders('foo', baseOptions), {
			'content-type': 'application/octet-stream',
		});
		deepStrictEqual(fileHeaders('hello.html', baseOptions), {
			'content-type': 'text/html; charset=UTF-8',
		});
	});

	test('cors option sets access-control-allow-origin', () => {
		deepStrictEqual(fileHeaders(null, { cors: false, headers: [] }), {});
		deepStrictEqual(fileHeaders(null, { cors: true, headers: [] }), {
			'access-control-allow-origin': '*',
		});
	});

	test('headers without include patterns are added for all responses', () => {
		/** @type {HttpHeaderRule[]} */
		const headers = [
			{ headers: { 'X-Header1': 'one' } },
			{ headers: { 'X-Header2': 'two' } },
			{ headers: { 'x-header1': 'three' } },
		];
		deepStrictEqual(fileHeaders(null, { cors: false, headers }), {
			'x-header1': 'three',
			'x-header2': 'two',
		});
		deepStrictEqual(fileHeaders('some/file.txt', { cors: false, headers }), {
			'content-type': 'text/plain; charset=UTF-8',
			'x-header1': 'three',
			'x-header2': 'two',
		});
	});

	test('custom headers with pattern are added matching files only', () => {
		/** @type {HttpHeaderRule[]} */
		const headers = [
			{ include: ['path'], headers: { 'x-header1': 'true' } },
			{ include: ['*.test'], headers: { 'Content-Type': 'test/custom-type' } },
		];
		const options = { cors: false, headers };
		deepStrictEqual(fileHeaders(null, options), {});
		deepStrictEqual(fileHeaders('README.test', options), {
			'content-type': 'test/custom-type',
		});
		deepStrictEqual(fileHeaders('path/to/README.md', options), {
			'content-type': 'text/markdown; charset=UTF-8',
			'x-header1': 'true',
		});
	});
});
