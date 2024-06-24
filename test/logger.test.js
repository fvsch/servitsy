import { strictEqual } from 'node:assert';
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
	 * @param {Pick<import('../lib/server.js').ReqResInfo, 'filePath' | 'method' | 'status' | 'urlPath'>} info
	 */
	const logLine = (info) => requestLogLine({ root: root(''), ...info });

	test('basic formatting', () => {
		strictEqual(logLine({ method: 'GET', status: 200, urlPath: '/' }), `[200] GET /`);
		strictEqual(
			logLine({ method: 'GET', status: 404, urlPath: '/favicon.ico' }),
			`[404] GET /favicon.ico`,
		);
		strictEqual(
			logLine({ method: 'GET', status: 403, urlPath: '/.htaccess' }),
			`[403] GET /.htaccess`,
		);
	});

	test('shows resolved file', () => {
		strictEqual(
			logLine({ method: 'GET', status: 200, urlPath: '/', filePath: root`index.html` }),
			`[200] GET /<index.html>`,
		);
		strictEqual(
			logLine({ method: 'GET', status: 200, urlPath: '/some/page', filePath: root`some/page.htm` }),
			`[200] GET /some/page<.htm>`,
		);
		strictEqual(
			logLine({
				method: 'POST',
				status: 201,
				urlPath: '/api/hello',
				filePath: root`api/hello.json`,
			}),
			`[201] POST /api/hello<.json>`,
		);
	});

	test('no resolved file suffix if filePath matches URL', () => {
		strictEqual(
			logLine({ method: 'GET', status: 200, urlPath: '/', filePath: root('') }),
			`[200] GET /`,
		);
		strictEqual(
			logLine({ method: 'GET', status: 200, urlPath: '/section1', filePath: root`section1` }),
			`[200] GET /section1`,
		);
		strictEqual(
			logLine({
				method: 'GET',
				status: 200,
				urlPath: '/section-two/',
				filePath: root`section-two`,
			}),
			`[200] GET /section-two/`,
		);
	});

	test('hides resolved file for error status', () => {
		strictEqual(
			logLine({ method: 'GET', status: 403, urlPath: '/.env', filePath: root`.env` }),
			`[403] GET /.env`,
		);
		strictEqual(
			logLine({ method: 'GET', status: 404, urlPath: '/robots.txt', filePath: root`robots.txt` }),
			`[404] GET /robots.txt`,
		);
	});
});
