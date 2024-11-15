import { stripVTControlCharacters } from 'node:util';
import { expect, suite, test } from 'vitest';

import { ColorUtils, requestLogLine } from '#src/logger.js';
import type { ResMetaData } from '#types';

suite('ColorUtils', () => {
	const color = new ColorUtils(true);
	const noColor = new ColorUtils(false);

	test('.style does nothing for empty format', () => {
		expect(color.style('TEST')).toBe('TEST');
		expect(color.style('TEST', '')).toBe('TEST');
		expect(noColor.style('TEST', '')).toBe('TEST');
	});

	test('.style adds color codes to strings', () => {
		expect(color.style('TEST', 'reset')).toBe('\x1B[0mTEST\x1B[0m');
		expect(color.style('TEST', 'red')).toBe('\x1B[31mTEST\x1B[39m');
		expect(color.style('TEST', 'dim underline')).toBe('\x1B[2m\x1B[4mTEST\x1B[24m\x1B[22m');
		expect(noColor.style('TEST', 'reset')).toBe('TEST');
		expect(noColor.style('TEST', 'red')).toBe('TEST');
		expect(noColor.style('TEST', 'dim underline')).toBe('TEST');
	});

	test('.sequence applies styles to sequence', () => {
		expect(color.sequence(['(', 'TEST', ')'])).toBe('(TEST)');
		expect(color.sequence(['TE', 'ST'], 'blue')).toBe('\x1B[34mTE\x1B[39mST');
		expect(color.sequence(['TE', 'ST'], ',blue')).toBe('TE\x1B[34mST\x1B[39m');
		expect(color.sequence(['TE', 'ST'], 'blue,red,green')).toBe(
			'\x1B[34mTE\x1B[39m\x1B[31mST\x1B[39m',
		);
		expect(noColor.sequence(['TE', 'ST'], 'blue')).toBe('TEST');
		expect(noColor.sequence(['TE', 'ST'], 'blue,red,green')).toBe('TEST');
	});

	test('.brackets adds characters around input', () => {
		expect(color.brackets('TEST', '')).toBe('[TEST]');
		expect(color.brackets('TEST', '', ['<<<', '>>>'])).toBe('<<<TEST>>>');
		expect(color.brackets('TEST', 'blue,,red')).toBe('\x1B[34m[\x1B[39mTEST\x1B[31m]\x1B[39m');
		expect(color.brackets('TEST')).toBe('\x1B[2m[\x1B[22mTEST\x1B[2m]\x1B[22m');
		expect(color.brackets('TEST', ',underline,', ['<<<', '>>>'])).toBe('<<<\x1B[4mTEST\x1B[24m>>>');
	});
});

suite('responseLogLine', () => {
	const matchLogLine = (data: Omit<ResMetaData, 'url' | 'timing'>, expected: string) => {
		const rawLine = requestLogLine({
			timing: { start: Date.now() },
			url: `http://localhost:8080${data.urlPath}`,
			...data,
		});
		const line = stripVTControlCharacters(rawLine).replace(/^\d{2}:\d{2}:\d{2} /, '');
		expect(line).toBe(expected);
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
