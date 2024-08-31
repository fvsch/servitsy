import { match, strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { stripStyle } from '../lib/color.js';
import { requestLogLine } from '../lib/logger.js';
import { testPath } from './shared.js';

suite('responseLogLine', () => {
	/**
	 * @param {Omit<import('../lib/server.js').ReqResInfo, 'root' | 'startedAt' | 'endedAt'>} info
	 * @param {string} expected
	 */
	const matchLogLine = (info, expected) => {
		const time = Date.now();
		const line = requestLogLine({
			root: testPath(''),
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
			},
			'200 — GET /',
		);
		matchLogLine(
			{
				method: 'GET',
				status: 404,
				urlPath: '/favicon.ico',
			},
			`404 — GET /favicon.ico`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 403,
				urlPath: '/.htaccess',
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
				filePath: testPath`index.html`,
			},
			`200 — GET /[index.html]`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/some/page',
				filePath: testPath`some/page.htm`,
			},
			`200 — GET /some/page[.htm]`,
		);
		matchLogLine(
			{
				method: 'POST',
				status: 201,
				urlPath: '/api/hello',
				filePath: testPath`api/hello.json`,
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
				filePath: testPath(''),
			},
			`200 — GET /`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/section1',
				filePath: testPath`section1`,
			},
			`200 — GET /section1`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/section-two/',
				filePath: testPath`section-two`,
			},
			`200 — GET /section-two/`,
		);
	});

	test('hides resolved file for error status', () => {
		matchLogLine(
			{
				method: 'GET',
				status: 403,
				urlPath: '/.env',
				filePath: testPath`.env`,
			},
			`403 — GET /.env`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 404,
				urlPath: '/robots.txt',
				filePath: testPath`robots.txt`,
			},
			`404 — GET /robots.txt`,
		);
	});
});
