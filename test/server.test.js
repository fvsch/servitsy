import { deepStrictEqual, doesNotThrow, match, ok, strictEqual } from 'node:assert';
import { IncomingMessage, Server, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { after, suite, test } from 'node:test';

import { FileResolver } from '../lib/resolver.js';
import { fileHeaders, staticServer, RequestHandler } from '../lib/server.js';
import { fsFixture, getBlankOptions, getDefaultOptions, platformSlash } from './shared.js';

/**
@typedef {import('../lib/types.js').HttpHeaderRule} HttpHeaderRule
@typedef {import('../lib/types.js').ServerOptions} ServerOptions
@typedef {Record<string, undefined | number | string | string[]>} ResponseHeaders
**/

const allowMethods = 'GET, HEAD, OPTIONS, POST';

/**
 * @param {ResponseHeaders} actual
 * @param {ResponseHeaders} expected */
function checkHeaders(actual, expected) {
	deepStrictEqual(actual, headersObj(expected));
}

/**
 * @param {ResponseHeaders} data
 */
function headersObj(data) {
	/** @type {ResponseHeaders} */
	const result = Object.create(null);
	for (const [key, value] of Object.entries(data)) {
		result[key.toLowerCase()] = value;
	}
	return result;
}

/**
 * @param {string} method
 * @param {string} url
 * @param {Record<string, string | string[]>} [headers]
 */
function mockReqRes(method, url, headers = {}) {
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

/**
 * @param {ServerOptions} options
 * @returns {(method: string, url: string, headers?: Record<string, string | string[]>) => RequestHandler}
 */
function handlerContext(options) {
	const resolver = new FileResolver(options);
	const handlerOptions = { ...options, gzip: false, _noStream: true };

	return (method, url, headers) => {
		const { req, res } = mockReqRes(method, url, headers);
		return new RequestHandler({ req, res }, resolver, handlerOptions);
	};
}

/**
 * @param {HttpHeaderRule[]} rules
 * @param {string[]} [blockList]
 * @returns {(filePath: string) => Array<{name: string; value: string}>}
 */
function withHeaderRules(rules, blockList) {
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
		deepStrictEqual(headers(''), expected);
		deepStrictEqual(headers('file.ext'), expected);
		deepStrictEqual(headers('any/thing.ext'), expected);
	});

	test('headers matching blocklist are rejected', () => {
		const headers = withHeaderRules(
			[
				{ headers: { 'X-Header1': 'one', 'Content-Length': '1000' } },
				{ include: ['*.*'], headers: { 'X-Header2': 'two', 'Content-Encoding': 'br' } },
			],
			['content-length', 'content-encoding'],
		);
		deepStrictEqual(headers(''), [{ name: 'X-Header1', value: 'one' }]);
		deepStrictEqual(headers('readme.md'), [
			{ name: 'X-Header1', value: 'one' },
			{ name: 'X-Header2', value: 'two' },
		]);
	});

	test('custom headers with pattern are added matching files only', () => {
		const headers = withHeaderRules([
			{ include: ['path'], headers: { 'x-header1': 'true' } },
			{ include: ['*.test'], headers: { 'Content-Type': 'test/custom-type' } },
		]);
		deepStrictEqual(headers(''), []);
		deepStrictEqual(headers('wrong-path/file.test.txt'), []);
		deepStrictEqual(headers('path/to/README.md'), [{ name: 'x-header1', value: 'true' }]);
		deepStrictEqual(headers('README.test'), [{ name: 'Content-Type', value: 'test/custom-type' }]);
		deepStrictEqual(headers('other/path/cool.test/index.html'), [
			{ name: 'x-header1', value: 'true' },
			{ name: 'Content-Type', value: 'test/custom-type' },
		]);
	});
});

suite('staticServer', () => {
	test("it doesn't crash", () => {
		doesNotThrow(() => {
			staticServer(getBlankOptions());
		});
	});
	test('returns a Node.js http.Server', () => {
		const server = staticServer(getBlankOptions());
		ok(server instanceof Server);
		strictEqual(typeof server.listen, 'function');
	});
});

suite('RequestHandler', async () => {
	const { fixture, file, root } = await fsFixture({
		'.gitignore': '*.html\n',
		'.well-known/security.txt': '# hello',
		'.well-known/something-else.json': '{"data":{}}',
		'index.html': '<h1>Hello World</h1>',
		'manifest.json': '{"hello": "world"}',
		'README.md': '# Cool stuff\n',
		'section/.htaccess': '# secret',
		'section/favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
		'section/index.html': '<h1>Section</h1>',
		'section/other-page.html': '<h1>Other page</h1>',
		'section/page.html': '<h1>Cool page</h1>',
		'some-folder/package.json': '{}',
		'some-folder/README.md': '# Hello',
	});
	const blankOptions = getBlankOptions(root());
	const defaultOptions = getDefaultOptions(root());
	const request = handlerContext(defaultOptions);

	after(() => fixture.rm());

	test('starts with a 200 status', async () => {
		const request = handlerContext(blankOptions);
		const handler = request('GET', '/');
		strictEqual(handler.method, 'GET');
		strictEqual(handler.urlPath, '/');
		strictEqual(handler.status, 200);
		strictEqual(handler.file, null);
	});

	for (const method of ['PUT', 'DELETE']) {
		test(`${method} method is unsupported`, async () => {
			const handler = request(method, '/README.md');
			strictEqual(handler.method, method);
			strictEqual(handler.status, 200);
			strictEqual(handler.urlPath, '/README.md');
			strictEqual(handler.file, null);

			await handler.process();
			strictEqual(handler.status, 405);
			strictEqual(handler.headers['allow'], allowMethods);
			strictEqual(handler.headers['content-type'], 'text/html; charset=UTF-8');
			match(`${handler.headers['content-length']}`, /^\d+$/);
		});
	}

	test('GET resolves a request with an index file', async () => {
		const handler = request('GET', '/');
		await handler.process();

		strictEqual(handler.status, 200);
		strictEqual(handler.file?.kind, 'file');
		strictEqual(handler.file?.localPath, 'index.html');
		strictEqual(handler.error, undefined);
	});

	test('GET returns a directory listing', async () => {
		const parent = file('', 'dir');
		const folder = file('some-folder', 'dir');
		const cases = [
			{ dirList: false, url: '/', status: 404, file: parent },
			{ dirList: false, url: '/some-folder/', status: 404, file: folder },
			{ dirList: true, url: '/', status: 200, file: parent },
			{ dirList: true, url: '/some-folder', status: 200, file: folder },
		];

		for (const { dirList, url, status, file } of cases) {
			const request = handlerContext({ ...blankOptions, dirList });
			const handler = request('GET', url);
			await handler.process();
			strictEqual(handler.status, status);
			// folder is still resolved when status is 404, just not used
			deepStrictEqual(handler.file, file);
			// both error and list pages are HTML
			strictEqual(handler.headers['content-type'], 'text/html; charset=UTF-8');
		}
	});

	test('GET returns a 404 for an unknown path', async () => {
		const control = request('GET', '/index.html');
		await control.process();
		strictEqual(control.status, 200);
		strictEqual(control.file?.localPath, 'index.html');

		const noFile = request('GET', '/does/not/exist');
		await noFile.process();
		strictEqual(noFile.status, 404);
		strictEqual(noFile.file, null);
	});

	test('GET finds .html files without extension', async () => {
		const page1 = request('GET', '/section/page');
		await page1.process();
		strictEqual(page1.status, 200);
		strictEqual(page1.file?.localPath, platformSlash`section/page.html`);

		const page2 = request('GET', '/section/other-page');
		await page2.process();
		strictEqual(page2.status, 200);
		strictEqual(page2.file?.localPath, platformSlash`section/other-page.html`);
	});

	test('GET shows correct content-type', async () => {
		const cases = [
			{ url: '/manifest.json', contentType: 'application/json; charset=UTF-8' },
			{ url: '/README.md', contentType: 'text/markdown; charset=UTF-8' },
			{ url: '/section/favicon.svg', contentType: 'image/svg+xml; charset=UTF-8' },
			{ url: '/section/page', contentType: 'text/html; charset=UTF-8' },
		];

		for (const { url, contentType } of cases) {
			const handler = request('GET', url);
			await handler.process();
			strictEqual(handler.status, 200);
			strictEqual(handler.headers['content-type'], contentType);
		}
	});

	test('POST is handled as GET', async () => {
		const cases = [
			{ url: '/', localPath: 'index.html', status: 200 },
			{ url: '/manifest.json', localPath: 'manifest.json', status: 200 },
			{ url: '/doesnt/exist', localPath: undefined, status: 404 },
		];
		for (const { url, localPath, status } of cases) {
			const getReq = request('GET', url);
			await getReq.process();
			strictEqual(getReq.method, 'GET');
			strictEqual(getReq.status, status);
			strictEqual(getReq.file?.localPath, localPath);

			const postReq = request('POST', url);
			await postReq.process();
			strictEqual(postReq.method, 'POST');
			strictEqual(postReq.status, status);
			strictEqual(postReq.file?.localPath, localPath);

			deepStrictEqual(getReq.file, postReq.file);
		}
	});

	test('HEAD with a 200 response', async () => {
		const handler = request('HEAD', '/');
		await handler.process();
		strictEqual(handler.method, 'HEAD');
		strictEqual(handler.status, 200);
		strictEqual(handler.file?.localPath, 'index.html');
		strictEqual(handler.headers['content-type'], 'text/html; charset=UTF-8');
		match(`${handler.headers['content-length']}`, /^\d+$/);
	});

	test('HEAD with a 404 response', async () => {
		const handler = request('HEAD', '/doesnt/exist');
		await handler.process();
		strictEqual(handler.method, 'HEAD');
		strictEqual(handler.status, 404);
		strictEqual(handler.file, null);
		strictEqual(handler.headers['content-type'], 'text/html; charset=UTF-8');
		match(`${handler.headers['content-length']}`, /^\d+$/);
	});

	test('OPTIONS *', async () => {
		const handler = request('OPTIONS', '*');
		await handler.process();
		strictEqual(handler.method, 'OPTIONS');
		strictEqual(handler.status, 204);
		checkHeaders(handler.headers, {
			allow: allowMethods,
			'content-length': '0',
		});
	});

	test('OPTIONS for existing file', async () => {
		const handler = request('OPTIONS', '/section/page');
		await handler.process();
		strictEqual(handler.method, 'OPTIONS');
		strictEqual(handler.status, 204);
		checkHeaders(handler.headers, {
			allow: allowMethods,
			'content-length': '0',
		});
	});

	test('OPTIONS for missing file', async () => {
		const handler = request('OPTIONS', '/doesnt/exist');
		await handler.process();
		strictEqual(handler.status, 404);
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
		strictEqual(getReq.status, 200);
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
		strictEqual(preflightReq.status, 204);
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
		strictEqual(getReq.status, 200);
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
		strictEqual(preflightReq.status, 204);
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
