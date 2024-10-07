import { match, strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { stripStyle } from '../lib/color.js';
import { requestLogLine } from '../lib/logger.js';
import { file } from './shared.js';

suite('responseLogLine', () => {
	/**
	 * @param {Omit<import('../lib/types.js').ReqResMeta, 'startedAt' | 'endedAt' | 'urlPath'>} data
	 * @param {string} expected
	 */
	const matchLogLine = (data, expected) => {
		const rawLine = requestLogLine({
			...data,
			urlPath: data.url.split(/[\?\#]/)[0],
			startedAt: Date.now(),
			endedAt: undefined,
		});
		const line = stripStyle(rawLine).replace(/^\d{2}:\d{2}:\d{2} /, '');
		strictEqual(line, expected);
	};

	test('basic formatting', () => {
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				url: '/',
				file: file('', 'dir'),
			},
			'200 — GET /',
		);
		matchLogLine(
			{
				method: 'GET',
				status: 404,
				url: '/favicon.ico',
				file: null,
			},
			`404 — GET /favicon.ico`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 403,
				url: '/.htaccess',
				file: file('.htaccess'),
			},
			`403 — GET /.htaccess`,
		);
	});

	test('shows resolved file', () => {
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				url: '/',
				file: file('index.html'),
			},
			`200 — GET /[index.html]`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				url: '/some/page',
				file: file('some/page.htm'),
			},
			`200 — GET /some/page[.htm]`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				url: '/other/page/',
				file: file('other/page.html'),
			},
			`200 — GET /other/page[.html]/`,
		);
		matchLogLine(
			{
				method: 'POST',
				status: 201,
				url: '/api/hello',
				file: file('api/hello.json'),
			},
			`201 — POST /api/hello[.json]`,
		);
	});

	test('no resolved file suffix if filePath matches URL', () => {
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				url: '/',
				file: file('', 'dir'),
			},
			`200 — GET /`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				url: '/section1',
				file: file('section1', 'dir'),
			},
			`200 — GET /section1`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				url: '/a/b/c/d/',
				file: file('a\\b\\c\\d', 'dir'),
			},
			`200 — GET /a/b/c/d/`,
		);
	});

	test('hides resolved file for error status', () => {
		matchLogLine(
			{
				method: 'GET',
				status: 403,
				url: '/.env',
				file: file('.env'),
			},
			`403 — GET /.env`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 404,
				url: '/robots.txt',
				file: file('robots.txt'),
			},
			`404 — GET /robots.txt`,
		);
	});
});
