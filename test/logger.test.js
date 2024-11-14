import { strictEqual } from 'node:assert';
import { suite, test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';

import { ColorUtils, requestLogLine } from '../lib/logger.js';

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

	test('.brackets adds characters around input', () => {
		strictEqual(color.brackets('TEST', ''), '[TEST]');
		strictEqual(color.brackets('TEST', '', ['<<<', '>>>']), '<<<TEST>>>');
		strictEqual(color.brackets('TEST', 'blue,,red'), '\x1B[34m[\x1B[39mTEST\x1B[31m]\x1B[39m');
		strictEqual(color.brackets('TEST'), '\x1B[2m[\x1B[22mTEST\x1B[2m]\x1B[22m');
		strictEqual(color.brackets('TEST', ',underline,', ['<<<', '>>>']), '<<<\x1B[4mTEST\x1B[24m>>>');
	});
});

suite('responseLogLine', () => {
	/**
	@param {Omit<import('../lib/types.d.ts').ResMetaData, 'url' | 'timing'>} data
	@param {string} expected
	*/
	const matchLogLine = (data, expected) => {
		const rawLine = requestLogLine({
			timing: { start: Date.now() },
			url: `http://localhost:8080${data.urlPath}`,
			...data,
		});
		const line = stripVTControlCharacters(rawLine).replace(/^\d{2}:\d{2}:\d{2} /, '');
		strictEqual(line, expected);
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
				localPath: 'some/page.htm',
			},
			`200 — GET /some/page[.htm]`,
		);
		matchLogLine(
			{
				method: 'GET',
				status: 200,
				urlPath: '/other/page/',
				localPath: 'other\\page.html',
			},
			`200 — GET /other/page[.html]/`,
		);
		matchLogLine(
			{
				method: 'POST',
				status: 201,
				urlPath: '/api/hello',
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
