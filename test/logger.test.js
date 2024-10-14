import { strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { ColorUtils, requestLogLine, stripStyle } from '../lib/logger.js';
import { file } from './shared.js';

suite('ColorUtils', () => {
	const color = new ColorUtils(true);
	const noColor = new ColorUtils(false);

	test('.style does nothing for empty format', () => {
		strictEqual(color.style('TEST'), 'TEST');
		strictEqual(color.style('TEST', ''), 'TEST');
		strictEqual(noColor.style('TEST', ''), 'TEST');
	});

	test('.style adds color codes to strings', () => {
		strictEqual(color.style('TEST', 'reset'), '\x1B[0mTEST\x1B[0m');
		strictEqual(color.style('TEST', 'red'), '\x1B[31mTEST\x1B[39m');
		strictEqual(color.style('TEST', 'dim underline'), '\x1B[2m\x1B[4mTEST\x1B[24m\x1B[22m');
		strictEqual(noColor.style('TEST', 'reset'), 'TEST');
		strictEqual(noColor.style('TEST', 'red'), 'TEST');
		strictEqual(noColor.style('TEST', 'dim underline'), 'TEST');
	});

	test('.sequence applies styles to sequence', () => {
		strictEqual(color.sequence(['(', 'TEST', ')']), '(TEST)');
		strictEqual(color.sequence(['TE', 'ST'], 'blue'), '\x1B[34mTE\x1B[39mST');
		strictEqual(color.sequence(['TE', 'ST'], ',blue'), 'TE\x1B[34mST\x1B[39m');
		strictEqual(
			color.sequence(['TE', 'ST'], 'blue,red,green'),
			'\x1B[34mTE\x1B[39m\x1B[31mST\x1B[39m',
		);
		strictEqual(noColor.sequence(['TE', 'ST'], 'blue'), 'TEST');
		strictEqual(noColor.sequence(['TE', 'ST'], 'blue,red,green'), 'TEST');
	});

	test('.strip removes formatting', () => {
		strictEqual(color.strip(color.style('TEST', 'magentaBright')), 'TEST');
		strictEqual(
			color.strip(color.sequence(['T', 'E', 'S', 'T'], 'inverse,blink,bold,red')),
			'TEST',
		);
	});

	test('.brackets adds characters around input', () => {
		strictEqual(color.brackets('TEST', ''), '[TEST]');
		strictEqual(color.brackets('TEST', '', ['<<<', '>>>']), '<<<TEST>>>');
		strictEqual(color.brackets('TEST', 'blue,,red'), '\x1B[34m[\x1B[39mTEST\x1B[31m]\x1B[39m');
		strictEqual(color.brackets('TEST'), '\x1B[2m[\x1B[22mTEST\x1B[2m]\x1B[22m');
		strictEqual(color.brackets('TEST', ',underline,', ['<<<', '>>>']), '<<<\x1B[4mTEST\x1B[24m>>>');
	});
});

/**
@typedef {import('../lib/types.d.ts').ReqResMeta} ReqResMeta
**/

suite('responseLogLine', () => {
	/**
	 * @param {Omit<ReqResMeta, 'startedAt' | 'endedAt' | 'urlPath'>} data
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
