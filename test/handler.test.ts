import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { afterAll, expect, suite, test } from 'vitest';

import { fileHeaders, isValidUrlPath, redirectSlash, RequestHandler } from '../src/handler.ts';
import { FileResolver } from '../src/resolver.ts';
import type { FSLocation, HttpHeaderRule, RuntimeOptions, TrailingSlash } from '../src/types.d.ts';
import { fsFixture, getBlankOptions, getDefaultOptions, loc, platformSlash } from './shared.ts';

type ResponseHeaders = Record<string, undefined | number | string | string[]>;

const allowMethods = 'GET, HEAD, OPTIONS, POST';

function checkHeaders(actual: ResponseHeaders, expected: ResponseHeaders) {
	expect(actual).toEqual(expected);
}

function mockReqRes(method: string, url: string, headers: Record<string, string | string[]> = {}) {
	const req = new IncomingMessage(
		// @ts-expect-error (we don't have a socket, hoping this is enough for testing)
		new Duplex(),
	);
	req.method = method;
	req.url = url;
	for (const [name, value] of Object.entries(headers)) {
		req.headers[name.toLowerCase()] = value;
	}
	const res = new ServerResponse(req);
	return { req, res };
}

function handlerContext(
	baseOptions: RuntimeOptions,
): (method: string, url: string, headers?: Record<string, string | string[]>) => RequestHandler {
	const options = { ...baseOptions, gzip: false };
	const resolver = new FileResolver(options);

	return (method, url, headers) => {
		const { req, res } = mockReqRes(method, url, headers);
		const handler = new RequestHandler({ req, res, resolver, options });
		handler._canRedirect = true;
		handler._canStream = false;
		return handler;
	};
}

function withHeaderRules(
	rules: HttpHeaderRule[],
	blockList?: string[],
): (filePath: string) => ReturnType<typeof fileHeaders> {
	return (filePath) => fileHeaders(filePath, rules, blockList);
}

suite('fileHeaders', () => {
	test('headers without include patterns are added for all responses', () => {
		const headers = withHeaderRules([
			{ headers: { 'X-Header1': 'one' } },
			{ headers: { 'X-Header2': 'two' } },
			{ headers: { 'x-header1': 'three' } },
			{ headers: { 'X-Header2': 'four' } },
		]);
		const expected = [
			{ name: 'X-Header1', value: 'one' },
			{ name: 'X-Header2', value: 'two' },
			{ name: 'x-header1', value: 'three' },
			{ name: 'X-Header2', value: 'four' },
		];
		expect(headers('')).toEqual(expected);
		expect(headers('file.ext')).toEqual(expected);
		expect(headers('any/thing.ext')).toEqual(expected);
	});

	test('headers matching blocklist are rejected', () => {
		const headers = withHeaderRules(
			[
				{ headers: { 'X-Header1': 'one', 'Content-Length': '1000' } },
				{ include: ['*.*'], headers: { 'X-Header2': 'two', 'Content-Encoding': 'br' } },
			],
			['content-length', 'content-encoding'],
		);
		expect(headers('')).toEqual([{ name: 'X-Header1', value: 'one' }]);
		expect(headers('readme.md')).toEqual([
			{ name: 'X-Header1', value: 'one' },
			{ name: 'X-Header2', value: 'two' },
		]);
	});

	test('custom headers with pattern are added matching files only', () => {
		const headers = withHeaderRules([
			{ include: ['path'], headers: { 'x-header1': 'true' } },
			{ include: ['*.test'], headers: { 'Content-Type': 'test/custom-type' } },
		]);
		expect(headers('')).toEqual([]);
		expect(headers('wrong-path/file.test.txt')).toEqual([]);
		expect(headers('path/to/README.md')).toEqual([{ name: 'x-header1', value: 'true' }]);
		expect(headers('README.test')).toEqual([{ name: 'Content-Type', value: 'test/custom-type' }]);
		expect(headers('other/path/cool.test/index.html')).toEqual([
			{ name: 'x-header1', value: 'true' },
			{ name: 'Content-Type', value: 'test/custom-type' },
		]);
	});
});

suite('isValidUrlPath', () => {
	const check = (urlPath: string, expected = true) => {
		expect(isValidUrlPath(urlPath)).toBe(expected);
	};

	test('rejects invalid paths', () => {
		check('', false);
		check('anything', false);
		check('https://example.com/hello', false);
		check('/hello?', false);
		check('/hello#intro', false);
		check('/hello//world', false);
		check('/hello\\world', false);
		check('/..', false);
		check('/%2E%2E/etc', false);
		check('/_%2F_%2F_', false);
		check('/_%5C_%5C_', false);
		check('/_%2f_%5c_', false);
	});

	test('accepts valid url paths', () => {
		check('/', true);
		check('/hello/world', true);
		check('/YES!/YES!!/THE TIGER IS OUT!', true);
		check('/.well-known/security.txt', true);
		check('/cool..story', true);
		check('/%20%20%20%20spaces%0A%0Aand%0A%0Alinebreaks%0A%0A%20%20%20%20', true);
		check(
			'/%E5%BA%A7%E9%96%93%E5%91%B3%E5%B3%B6%E3%81%AE%E5%8F%A4%E5%BA%A7%E9%96%93%E5%91%B3%E3%83%93%E3%83%BC%E3%83%81%E3%80%81%E6%B2%96%E7%B8%84%E7%9C%8C%E5%B3%B6%E5%B0%BB%E9%83%A1%E5%BA%A7%E9%96%93%E5%91%B3%E6%9D%91',
			true,
		);
	});
});

suite('redirectSlash', () => {
	const { dir, file } = loc;
	const url = (path: string) => {
		const base = 'http://localhost/';
		return new URL(path.startsWith('//') ? base + path.slice(1) : path, base);
	};

	const getRs = (slash: TrailingSlash) => {
		return (urlPath: string, file?: FSLocation) => redirectSlash(url(urlPath), { file: file ?? null, slash });
	};

	test('keeps empty path or single slash', () => {
		const rs = getRs('auto');
		expect(rs('', dir(''))).toBeUndefined();
		expect(rs('/', dir(''))).toBeUndefined();
		expect(rs('', file('index.html'))).toBeUndefined();
		expect(rs('/', file('index.html'))).toBeUndefined();
	});

	test('redirects duplicate slashes', () => {
		const rs = getRs('auto');
		expect(rs('//')).toBe('/');
		expect(rs('///////one')).toBe('/one');
		expect(rs('/two//////')).toBe('/two/');
		expect(rs('//a//b///////c')).toBe('/a/b/c');
		expect(rs('//d//e///////f/////')).toBe('/d/e/f/');
		expect(rs('///x?y#z')).toBe('/x?y#z');
	});

	test('slash=keep does not change trailing slash', () => {
		const rs = getRs('ignore');
		for (const path of ['/', '/notrail', '/trailing/']) {
			expect(rs(path)).toBeUndefined();
			expect(rs(path, file(path))).toBeUndefined();
			expect(rs(path, file(path))).toBeUndefined();
		}
	});

	test('slash=always adds trailing slash', () => {
		const rs = getRs('always');
		expect(rs('/notrail')).toBe('/notrail/');
		expect(rs('/trailing/')).toBe(undefined);
		expect(rs('/notrail', file('notrail'))).toBe('/notrail/');
		expect(rs('/trailing/', file('trailing'))).toBe(undefined);
		expect(rs('/notrail', dir('notrail'))).toBe('/notrail/');
		expect(rs('/trailing/', dir('trailing'))).toBe(undefined);
	});

	test('slash=never removes trailing slash', () => {
		const rs = getRs('never');
		expect(rs('/notrail')).toBe(undefined);
		expect(rs('/trailing/')).toBe('/trailing');
		expect(rs('/notrail', file('notrail'))).toBe(undefined);
		expect(rs('/trailing/', file('trailing'))).toBe('/trailing');
		expect(rs('/notrail', dir('notrail'))).toBe(undefined);
		expect(rs('/trailing/', dir('trailing'))).toBe('/trailing');
	});

	test('slash=auto keeps trailing slash when no file is found', () => {
		const rs = getRs('auto');
		expect(rs('/')).toBe(undefined);
		expect(rs('/notrail')).toBe(undefined);
		expect(rs('/trailing/')).toBe(undefined);
	});

	test('slash=auto redirects files with trailing slash', () => {
		const rs = getRs('auto');
		expect(rs('/notrail', file('notrail.html'))).toBe(undefined);
		expect(rs('/TEST/trailing/', file('trailing.html'))).toBe('/TEST/trailing');
		expect(rs('/section/notrail.html', file('notrail.html'))).toBe(undefined);
		expect(rs('/section/trailing.html/', file('trailing.html'))).toBe('/section/trailing.html');
	});

	test('slash=auto redirects dirs without trailing slash', () => {
		const rs = getRs('auto');
		expect(rs('/notrail', dir('notrail'))).toBe('/notrail/');
		expect(rs('/trailing/', dir('trailing'))).toBe(undefined);
		expect(rs('/.test/notrail', dir('.test/notrail'))).toBe('/.test/notrail/');
		expect(rs('/.test/trailing/', dir('.test/trailing'))).toBe(undefined);
	});
});

suite('RequestHandler', async () => {
	const { fixture, dir, path } = await fsFixture({
		'.gitignore': '*.html\n',
		'.well-known/security.txt': '# hello',
		'.well-known/something-else.json': '{"data":{}}',
		'最近の更新.html': '<h1>最近の更新</h1>',
		'index.html': '<h1>Hello World</h1>',
		'manifest.json': '{"hello": "world"}',
		'README.md': '# Cool stuff\n',
		'section/.htaccess': '# secret',
		'section/favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
		'section/index.html': '<h1>Section</h1>',
		'section/other-page.html': '<h1>Other page</h1>',
		'section/page.html': '<h1>Cool page</h1>',
		'Some Folder/package.json': '{}',
		'Some Folder/README.md': '# Hello',
	});
	const blankOptions = getBlankOptions(path());
	const defaultOptions = getDefaultOptions(path());
	const request = handlerContext(defaultOptions);

	afterAll(() => fixture.rm());

	test('starts with a 200 status', async () => {
		const request = handlerContext(blankOptions);
		const handler = request('GET', '/');
		expect(handler.method).toBe('GET');
		expect(handler.url?.pathname).toBe('/');
		expect(handler.status).toBe(200);
		expect(handler.file).toBe(null);
	});

	for (const method of ['PUT', 'DELETE']) {
		test(`${method} method is unsupported`, async () => {
			const handler = request(method, '/README.md');
			expect(handler.method).toBe(method);
			expect(handler.status).toBe(200);
			expect(handler.url?.pathname).toBe('/README.md');
			expect(handler.file).toBe(null);

			await handler.process();
			expect(handler.status).toBe(405);
			expect(handler.headers['allow']).toBe(allowMethods);
			expect(handler.headers['content-type']).toBe('text/html; charset=UTF-8');
			expect(`${handler.headers['content-length']}`).toMatch(/^\d+$/);
		});
	}

	test('GET redirects path with duplicate slashes', async () => {
		const handler = request('GET', '///cool///path///');
		await handler.process();
		expect(handler.status).toBe(307);
		expect(handler.headers.location).toBe('/cool/path/');
	});

	test('GET redirects trailing slash depending on file kind', async () => {
		const reqFile = request('GET', '/section/page/');
		await reqFile.process();
		expect(reqFile.file?.kind).toBe('file');
		expect(reqFile.status).toBe(307);
		expect(reqFile.headers.location).toBe('/section/page');

		/* Buggy
		const reqDir = request('GET', '/section');
		await reqDir.process();
		console.log(reqDir.file);
		expect(reqDir.file?.kind).toBe('dir');
		expect(reqDir.status).toBe(307);
		expect(reqDir.headers.location).toBe('/section/');
		*/
	});

	test('GET returns 400 for invalid URL-encoded chars', async () => {
		const one = request('GET', '/cool/%2F%0A%2F%0A/path/');
		await one.process();
		expect(one.status).toBe(400);

		const two = request('GET', '/cool/%5C%5C/path/');
		await two.process();
		expect(two.status).toBe(400);
	});

	test('GET returns 404 for an unknown path', async () => {
		const control = request('GET', '/index.html');
		await control.process();
		expect(control.status).toBe(200);
		expect(control.localPath).toBe('index.html');

		const noFile = request('GET', '/does/not/exist');
		await noFile.process();
		expect(noFile.status).toBe(404);
		expect(noFile.file).toBe(null);
		expect(noFile.localPath).toBe(null);
	});

	test('GET resolves a request with an index file', async () => {
		const handler = request('GET', '/');
		await handler.process();

		expect(handler.status).toBe(200);
		expect(handler.file?.kind).toBe('file');
		expect(handler.localPath).toBe('index.html');
		expect(handler.error).toBe(undefined);
	});

	test('GET finds .html files without extension', async () => {
		const page1 = request('GET', '/section/page');
		await page1.process();
		expect(page1.status).toBe(200);
		expect(page1.localPath).toBe(platformSlash`section/page.html`);

		const page2 = request('GET', '/section/other-page');
		await page2.process();
		expect(page2.status).toBe(200);
		expect(page2.localPath).toBe(platformSlash`section/other-page.html`);
	});

	test('GET shows correct content-type', async () => {
		const checkType = async (url = '', contentType = '') => {
			const handler = request('GET', url);
			await handler.process();
			expect(handler.status, `Correct status for GET ${url}`).toBe(200);
			expect(handler.headers['content-type'], `Correct content-type for GET ${url}`).toBe(
				contentType,
			);
		};

		await checkType('/manifest.json', 'application/json; charset=UTF-8');
		await checkType('/README.md', 'text/markdown; charset=UTF-8');
		await checkType('/section/favicon.svg', 'image/svg+xml; charset=UTF-8');
		await checkType('/section/page', 'text/html; charset=UTF-8');
		await checkType('/%E6%9C%80%E8%BF%91%E3%81%AE%E6%9B%B4%E6%96%B0', 'text/html; charset=UTF-8');
	});

	test('GET returns a directory listing', async () => {
		const parent = dir('');
		const folder = dir('Some Folder');
		const cases = [
			{ list: false, url: '/', status: 404, file: parent },
			{ list: false, url: '/Some%20Folder/', status: 404, file: folder },
			{ list: true, url: '/', status: 200, file: parent },
			{ list: true, url: '/Some%20Folder/', status: 200, file: folder },
		];

		for (const { list, url, status, file } of cases) {
			const request = handlerContext({ ...blankOptions, list });
			const handler = request('GET', url);
			await handler.process();
			expect(handler.status).toBe(status);
			// both error and list pages are HTML
			expect(handler.headers['content-type']).toBe('text/html; charset=UTF-8');
			// folder is still resolved when status is 404, just not used
			expect(handler.file).toEqual(file);
		}
	});

	test('POST is handled as GET', async () => {
		const cases = [
			{ url: '/', localPath: 'index.html', status: 200 },
			{ url: '/manifest.json', localPath: 'manifest.json', status: 200 },
			{ url: '/doesnt/exist', localPath: null, status: 404 },
		];

		for (const { url, localPath, status } of cases) {
			const getReq = request('GET', url);
			await getReq.process();
			expect(getReq.method).toBe('GET');
			expect(getReq.status).toBe(status);
			expect(getReq.localPath).toBe(localPath);

			const postReq = request('POST', url);
			await postReq.process();
			expect(postReq.method).toBe('POST');
			expect(postReq.status).toBe(status);
			expect(postReq.localPath).toBe(localPath);

			// other than method, results are identical
			expect(getReq.status).toBe(postReq.status);
			expect(getReq.file).toEqual(postReq.file);
		}
	});

	test('HEAD with a 200 response', async () => {
		const handler = request('HEAD', '/');
		await handler.process();
		expect(handler.method).toBe('HEAD');
		expect(handler.status).toBe(200);
		expect(handler.localPath).toBe('index.html');
		expect(handler.headers['content-type']).toBe('text/html; charset=UTF-8');
		expect(`${handler.headers['content-length']}`).toMatch(/^\d+$/);
	});

	test('HEAD with a 404 response', async () => {
		const handler = request('HEAD', '/doesnt/exist');
		await handler.process();
		expect(handler.method).toBe('HEAD');
		expect(handler.status).toBe(404);
		expect(handler.file).toBe(null);
		expect(handler.headers['content-type']).toBe('text/html; charset=UTF-8');
		expect(`${handler.headers['content-length']}`).toMatch(/^\d+$/);
	});

	test('OPTIONS *', async () => {
		const handler = request('OPTIONS', '*');
		await handler.process();
		expect(handler.method).toBe('OPTIONS');
		expect(handler.status).toBe(204);
		checkHeaders(handler.headers, {
			allow: allowMethods,
			'content-length': '0',
		});
	});

	test('OPTIONS for existing file', async () => {
		const handler = request('OPTIONS', '/section/page');
		await handler.process();
		expect(handler.method).toBe('OPTIONS');
		expect(handler.status).toBe(204);
		checkHeaders(handler.headers, {
			allow: allowMethods,
			'content-length': '0',
		});
	});

	test('OPTIONS for missing file', async () => {
		const handler = request('OPTIONS', '/doesnt/exist');
		await handler.process();
		expect(handler.status).toBe(404);
		checkHeaders(handler.headers, {
			allow: allowMethods,
			'content-length': '0',
		});
	});

	test('CORS: no CORS headers by default', async () => {
		const request = handlerContext(blankOptions);

		const getReq = request('GET', '/manifest.json', {
			Origin: 'https://example.com',
			'Access-Control-Request-Method': 'GET',
		});
		await getReq.process();
		expect(getReq.status).toBe(200);
		checkHeaders(getReq.headers, {
			'content-type': 'application/json; charset=UTF-8',
			'content-length': '18',
		});

		const preflightReq = request('OPTIONS', '/manifest.json', {
			Origin: 'https://example.com',
			'Access-Control-Request-Method': 'POST',
			'Access-Control-Request-Headers': 'X-Header1',
		});
		await preflightReq.process();
		expect(preflightReq.status).toBe(204);
		checkHeaders(preflightReq.headers, {
			allow: allowMethods,
			'content-length': '0',
		});
	});

	test('CORS headers when enabled', async () => {
		const request = handlerContext({ ...blankOptions, cors: true });

		const getReq = request('GET', '/manifest.json', {
			Origin: 'https://example.com',
			'Access-Control-Request-Method': 'GET',
		});
		await getReq.process();
		expect(getReq.status).toBe(200);
		checkHeaders(getReq.headers, {
			'access-control-allow-origin': 'https://example.com',
			'content-type': 'application/json; charset=UTF-8',
			'content-length': '18',
		});

		const preflightReq = request('OPTIONS', '/manifest.json', {
			Origin: 'https://example.com',
			'Access-Control-Request-Method': 'POST',
			'Access-Control-Request-Headers': 'X-Header1',
		});
		await preflightReq.process();
		expect(preflightReq.status).toBe(204);
		checkHeaders(preflightReq.headers, {
			allow: allowMethods,
			'access-control-allow-headers': 'X-Header1',
			'access-control-allow-methods': 'GET, HEAD, OPTIONS, POST',
			'access-control-allow-origin': 'https://example.com',
			'access-control-max-age': '60',
			'content-length': '0',
		});
	});
});
