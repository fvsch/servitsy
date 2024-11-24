import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { afterAll, expect, suite, test } from 'vitest';

import { extractUrlPath, fileHeaders, isValidUrlPath, RequestHandler } from '../src/handler.ts';
import { FileResolver } from '../src/resolver.ts';
import type { HttpHeaderRule, ServerOptions } from '../src/types.d.ts';
import { fsFixture, getBlankOptions, getDefaultOptions, platformSlash } from './shared.ts';

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
	options: Required<ServerOptions>,
): (method: string, url: string, headers?: Record<string, string | string[]>) => RequestHandler {
	const resolver = new FileResolver(options);
	const handlerOptions = { ...options, gzip: false, _noStream: true };

	return (method, url, headers) => {
		const { req, res } = mockReqRes(method, url, headers);
		return new RequestHandler({ req, res, resolver, options: handlerOptions });
	};
}

function withHeaderRules(
	rules: HttpHeaderRule[],
	blockList?: string[],
): (filePath: string) => ReturnType<typeof fileHeaders> {
	return (filePath) => fileHeaders(filePath, rules, blockList);
}

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

suite('extractUrlPath', () => {
	const checkUrl = (url: string, expected: string | null) => {
		expect(extractUrlPath(url)).toBe(expected);
	};

	test('extracts URL pathname', () => {
		checkUrl('https://example.com/hello/world', '/hello/world');
		checkUrl('/hello/world?cool=test', '/hello/world');
		checkUrl('/hello/world#right', '/hello/world');
	});

	test('keeps percent encoding', () => {
		checkUrl('/Super%3F%20%C3%89patant%21/', '/Super%3F%20%C3%89patant%21/');
		checkUrl('/%E3%82%88%E3%81%86%E3%81%93%E3%81%9D', '/%E3%82%88%E3%81%86%E3%81%93%E3%81%9D');
	});

	test('resolves double-dots and slashes', () => {
		// `new URL` treats backslashes as forward slashes
		checkUrl('/a\\b', '/a/b');
		checkUrl('/a\\.\\b', '/a/b');
		checkUrl('/\\foo/', '/');
		// double dots are resolved
		checkUrl('/../bar', '/bar');
		checkUrl('/%2E%2E/bar', '/bar');
	});
});

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
		expect(handler.urlPath).toBe('/');
		expect(handler.status).toBe(200);
		expect(handler.file).toBe(null);
	});

	for (const method of ['PUT', 'DELETE']) {
		test(`${method} method is unsupported`, async () => {
			const handler = request(method, '/README.md');
			expect(handler.method).toBe(method);
			expect(handler.status).toBe(200);
			expect(handler.urlPath).toBe('/README.md');
			expect(handler.file).toBe(null);

			await handler.process();
			expect(handler.status).toBe(405);
			expect(handler.headers['allow']).toBe(allowMethods);
			expect(handler.headers['content-type']).toBe('text/html; charset=UTF-8');
			expect(`${handler.headers['content-length']}`).toMatch(/^\d+$/);
		});
	}

	test('GET resolves a request with an index file', async () => {
		const handler = request('GET', '/');
		await handler.process();

		expect(handler.status).toBe(200);
		expect(handler.file?.kind).toBe('file');
		expect(handler.localPath).toBe('index.html');
		expect(handler.error).toBe(undefined);
	});

	test('GET returns a directory listing', async () => {
		const parent = dir('');
		const folder = dir('Some Folder');
		const cases = [
			{ dirList: false, url: '/', status: 404, file: parent },
			{ dirList: false, url: '/Some%20Folder/', status: 404, file: folder },
			{ dirList: true, url: '/', status: 200, file: parent },
			{ dirList: true, url: '/Some%20Folder/', status: 200, file: folder },
		];

		for (const { dirList, url, status, file } of cases) {
			const request = handlerContext({ ...blankOptions, dirList });
			const handler = request('GET', url);
			await handler.process();
			expect(handler.status).toBe(status);
			// both error and list pages are HTML
			expect(handler.headers['content-type']).toBe('text/html; charset=UTF-8');
			// folder is still resolved when status is 404, just not used
			expect(handler.file).toEqual(file);
		}
	});

	test('GET returns a 404 for an unknown path', async () => {
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
