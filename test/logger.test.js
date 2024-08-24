import { match, strictEqual } from 'node:assert';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { suite, test } from 'node:test';

import { requestLogLine } from '../lib/logger.js';

/**
 * @type {(s: string | TemplateStringsArray, ...v: string[]) => string}
 */
export function root(strings = '', ...values) {
	const subpath = String.raw({ raw: strings }, ...values);
	return join(cwd(), 'tmp/test', subpath);
}

suite('responseLogLine', () => {
	/**
	 * @param {Omit<import('../lib/server.js').ReqResInfo, 'root' | 'startedAt' | 'endedAt'>} info
	 * @param {string} expected
	 */
	const matchLogLine = (info, expected) => {
		const time = Date.now();
		const line = requestLogLine({
			root: root(''),
			startedAt: time,
			endedAt: time,
			...info,
		});
		const pattern = /^(?:\d{2}:\d{2}:\d{2} )(.*)$/;
		match(line, pattern);
		strictEqual(line.match(pattern)?.[1], expected);
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
				filePath: root`index.html`,
			},
			`200 — GET /<index.html>`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/some/page',
				filePath: root`some/page.htm`,
			},
			`200 — GET /some/page<.htm>`,
		);
		matchLogLine(
			{
				method: 'POST',
				status: 201,
				urlPath: '/api/hello',
				filePath: root`api/hello.json`,
			},
			`201 — POST /api/hello<.json>`,
		);
	});

	test('no resolved file suffix if filePath matches URL', () => {
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/',
				filePath: root(''),
			},
			`200 — GET /`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/section1',
				filePath: root`section1`,
			},
			`200 — GET /section1`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/section-two/',
				filePath: root`section-two`,
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
				filePath: root`.env`,
			},
			`403 — GET /.env`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 404,
				urlPath: '/robots.txt',
				filePath: root`robots.txt`,
			},
			`404 — GET /robots.txt`,
		);
	});
});
