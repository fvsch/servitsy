import { type Buffer } from 'node:buffer';
import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { expect, suite, test } from 'vitest';

import { ColorUtils, Logger, requestLogLine } from '../src/logger.ts';
import type { ResMetaData } from '../src/types.d.ts';

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

suite('Logger', () => {
	class TestWritable extends Writable {
		rawContents = '';
		contents = '';
		_write(chunk: string | Buffer, encoding: string, cb?: (error?: Error | null) => void) {
			const str = chunk.toString();
			this.rawContents += str;
			this.contents += stripVTControlCharacters(str);
			if (typeof cb === 'function') cb();
		}
	}

	const getLogger = () => {
		const out = new TestWritable();
		const err = new TestWritable();
		const logger = new Logger(out, err);
		return { out, err, logger };
	};

	test('Writes logs to their respective out and err streams', async () => {
		const { out, err, logger } = getLogger();
		await logger.write('info', 'Info 1');
		await logger.write('error', 'Error 1');
		await logger.write('info', 'Info 2');
		await logger.write('error', 'Error 2');
		expect(out.contents).toBe(`Info 1\nInfo 2\n`);
		expect(err.contents).toBe(`Error 1\nError 2\n`);
	});

	test('Adds blank lines between logs of different groups', async () => {
		const { out, logger } = getLogger();
		await logger.write('header', 'Header');
		await logger.write('request', 'Request 1');
		await logger.write('request', 'Request 2');
		await logger.write('info', 'Info 1');
		await logger.write('request', 'Request 3');
		await logger.write('request', 'Request 4');
		await logger.write('request', 'Request 5');
		await logger.write('info', 'Info 2');
		expect(out.contents).toBe(`Header

Request 1
Request 2

Info 1

Request 3
Request 4
Request 5

Info 2
`);
	});

	test('accepts custom padding', async () => {
		const { out, logger } = getLogger();
		await logger.write('info', ['aaa', 'bbb', 'ccc'], {
			// should yield two `\n`
			top: 2,
			// should yield three '\n' (return + two empty lines)
			bottom: 2,
		});
		await logger.write('info', 'final', {
			// merged with previous log's bottom padding
			top: 2,
			// capped at 4, resulting in 5 '\n'
			bottom: 12,
		});
		expect(out.contents).toBe('\n\naaa\nbbb\nccc\n\n\nfinal\n\n\n\n\n');
	});

	test('error logs strings', async () => {
		const { err, logger } = getLogger();
		await logger.error('Error 1');
		await logger.error('Error 2');
		expect(err.contents).toBe(`servitsy: Error 1\nservitsy: Error 2\n`);
	});

	test('error logs Errors with stack trace', async () => {
		const { err, logger } = getLogger();
		await logger.error(new Error('Whoops'));
		expect(err.contents).toMatch(`Error: Whoops`);
		expect(err.contents).toMatch(/[\\\/]test[\\\/]logger\.test\.ts:\d+:\d+/);
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
