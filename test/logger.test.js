import { match, strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { stripStyle } from '../lib/color.js';
import { requestLogLine } from '../lib/logger.js';

suite('responseLogLine', () => {
	/**
	 * @param {Omit<import('../lib/types.js').ReqResInfo, 'startedAt' | 'endedAt'>} info
	 * @param {string} expected
	 */
	const matchLogLine = (info, expected) => {
		const time = Date.now();
		const line = requestLogLine({
			startedAt: time,
			endedAt: time,
			...info,
		});
		const rawLine = stripStyle(line);
		const pattern = /^(?:\d{2}:\d{2}:\d{2} )(.*)$/;
		match(rawLine, pattern);
		strictEqual(rawLine.match(pattern)?.[1], expected);
	};

	test('basic formatting', () => {
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/',
				localPath: '',
			},
			'200 — GET /',
		);
		matchLogLine(
			{
				method: 'GET',
				status: 404,
				urlPath: '/favicon.ico',
				localPath: null,
			},
			`404 — GET /favicon.ico`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 403,
				urlPath: '/.htaccess',
				localPath: '.htaccess',
			},
			`403 — GET /.htaccess`,
		);
	});

	test('shows resolved file', () => {
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/',
				localPath: 'index.html',
			},
			`200 — GET /[index.html]`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/some/page',
				localPath: 'some\\page.htm',
			},
			`200 — GET /some/page[.htm]`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/other/page/',
				localPath: 'other/page.html',
			},
			`200 — GET /other/page[.html]`,
		);
		matchLogLine(
			{
				method: 'POST',
				status: 201,
				urlPath: '/api/hello/',
				localPath: 'api\\hello.json',
			},
			`201 — POST /api/hello[.json]`,
		);
	});

	test('no resolved file suffix if filePath matches URL', () => {
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/',
				localPath: '',
			},
			`200 — GET /`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/section1',
				localPath: 'section1',
			},
			`200 — GET /section1`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/a/b/c/d/',
				localPath: 'a\\b\\c\\d',
			},
			`200 — GET /a/b/c/d/`,
		);
	});

	test('hides resolved file for error status', () => {
		matchLogLine(
			{
				method: 'GET',
				status: 403,
				urlPath: '/.env',
				localPath: '.env',
			},
			`403 — GET /.env`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 404,
				urlPath: '/robots.txt',
				localPath: 'robots.txt',
			},
			`404 — GET /robots.txt`,
		);
	});
});
