import { deepStrictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { fileHeaders } from '../lib/server.js';

/**
@typedef {import('../lib/types.js').HttpHeaderRule} HttpHeaderRule
@typedef {{ cors: boolean; headers: HttpHeaderRule[] }} FileHeadersOptions
**/

suite('fileHeaders', () => {
	/** @type {FileHeadersOptions} */
	const baseOptions = { cors: false, headers: [] };

	/** @type {(baseOptions: FileHeadersOptions) => (filePath: string, options?: Partial<FileHeadersOptions>) => Record<string, string>} */
	const headersWith = (baseOptions) => {
		return (filePath, options = {}) => fileHeaders(filePath, { ...baseOptions, ...options });
	};

	test('sets content-type header', () => {
		const headersFor = headersWith(baseOptions);
		deepStrictEqual(headersFor('foo'), {
			'content-type': 'application/octet-stream',
		});
		deepStrictEqual(fileHeaders('hello.html', baseOptions), {
			'content-type': 'text/html; charset=UTF-8',
		});
	});

	test('cors option sets access-control-allow-origin', () => {
		const headersFor = headersWith(baseOptions);
		deepStrictEqual(headersFor('foo', { cors: false }), {
			'content-type': 'application/octet-stream',
		});
		deepStrictEqual(headersFor('foo', { cors: true }), {
			'content-type': 'application/octet-stream',
			'access-control-allow-origin': '*',
		});
	});

	test('headers without include patterns are added for all responses', () => {
		const headersFor = headersWith({
			cors: false,
			headers: [
				{ headers: { 'X-Header1': 'one' } },
				{ headers: { 'X-Header2': 'two' } },
				{ headers: { 'x-header1': 'three' } },
			],
		});
		deepStrictEqual(headersFor('some/file.txt'), {
			'content-type': 'text/plain; charset=UTF-8',
			'x-header1': 'three',
			'x-header2': 'two',
		});
	});

	test('custom headers with pattern are added matching files only', () => {
		const headersFor = headersWith({
			cors: false,
			headers: [
				{ include: ['path'], headers: { 'x-header1': 'true' } },
				{ include: ['*.test'], headers: { 'Content-Type': 'test/custom-type' } },
			],
		});
		deepStrictEqual(headersFor('README.test'), {
			'content-type': 'test/custom-type',
		});
		deepStrictEqual(headersFor('path/to/README.md'), {
			'content-type': 'text/markdown; charset=UTF-8',
			'x-header1': 'true',
		});
	});
});
