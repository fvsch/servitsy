import { deepStrictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { fileHeaders } from '../lib/server.js';

/**
@typedef {import('../lib/types.js').HttpHeaderRule} HttpHeaderRule
@typedef {import('../lib/types.js').ServerOptions} ServerOptions
@typedef {Parameters<typeof fileHeaders>[0]} FileHeadersData
**/

suite('fileHeaders', () => {
	/**
	 * @param {Partial<FileHeadersData> & { localPath: string }} data
	 * @param {Record<string, string>} expected
	 */
	const checkHeaders = (data, expected) => {
		deepStrictEqual(fileHeaders({ cors: false, headers: [], ...data }), expected);
	};

	test('keeps provided content-type header', () => {
		checkHeaders(
			{ localPath: 'foo', contentType: 'text/html' },
			{
				'content-type': 'text/html',
			},
		);
	});

	test('sets content-type header', () => {
		checkHeaders(
			{ localPath: 'foo' },
			{
				'content-type': 'application/octet-stream',
			},
		);
		checkHeaders(
			{ localPath: 'hello.html' },
			{
				'content-type': 'text/html; charset=UTF-8',
			},
		);
	});

	test('cors option sets access-control-allow-origin', () => {
		checkHeaders(
			{ localPath: 'foo', cors: false },
			{
				'content-type': 'application/octet-stream',
			},
		);
		checkHeaders(
			{ localPath: 'foo', cors: true },
			{
				'content-type': 'application/octet-stream',
				'access-control-allow-origin': '*',
			},
		);
	});

	test('headers without include patterns are added for all responses', () => {
		/** @type {FileHeadersData['headers']} */
		const headers = [
			{ headers: { 'X-Header1': 'one' } },
			{ headers: { 'X-Header2': 'two' } },
			{ headers: { 'x-header1': 'three' } },
		];
		checkHeaders(
			{ localPath: 'some/file.txt', headers },
			{
				'content-type': 'text/plain; charset=UTF-8',
				'x-header1': 'three',
				'x-header2': 'two',
			},
		);
	});

	test('custom headers with pattern are added matching files only', () => {
		/** @type {FileHeadersData['headers']} */
		const headers = [
			{ include: ['path'], headers: { 'x-header1': 'true' } },
			{ include: ['*.test'], headers: { 'Content-Type': 'test/custom-type' } },
		];
		checkHeaders(
			{ localPath: 'README.test', headers },
			{
				'content-type': 'test/custom-type',
			},
		);
		checkHeaders(
			{ localPath: 'path/to/README.md', headers },
			{
				'content-type': 'text/markdown; charset=UTF-8',
				'x-header1': 'true',
			},
		);
	});
});
