import { deepStrictEqual, doesNotThrow, match, ok, strictEqual } from 'node:assert';
import { IncomingMessage, Server, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { suite, test } from 'node:test';

import { readPkgFile } from '../lib/fs-proxy.js';
import { fileHeaders, staticServer, RequestHandler } from '../lib/server.js';
import { blankOptions, defaultOptions, file, getResolver } from './shared.js';

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
 * @param {Parameters<typeof getResolver>[1]} files
 * @returns {(method: string, url: string, headers?: Record<string, string | string[]>) => RequestHandler}
 */
function withHandlerContext(options, files) {
	const resolver = getResolver(options, files);
	const handlerOptions = { ...options, streaming: false };

	return (method, url, headers) => {
		const { req, res } = mockReqRes(method, url, headers);
		return new RequestHandler({ req, res }, resolver, handlerOptions);
	};
}

/**
 * @param {HttpHeaderRule[]} rules
 * @returns {(filePath: string) => Array<{name: string; value: string}>}
 */
function withHeaderRules(rules) {
	return (filePath) => fileHeaders(filePath, rules);
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
			staticServer(defaultOptions);
		});
	});
	test('returns a Node.js http.Server', () => {
		const server = staticServer(defaultOptions);
		ok(server instanceof Server);
		strictEqual(typeof server.listen, 'function');
	});
});

suite('RequestHandler.constructor', () => {
	test('starts with a 404 status', async () => {
		const options = { ...blankOptions, streaming: false };
		const handler = new RequestHandler(mockReqRes('GET', '/'), getResolver(), options);
		strictEqual(handler.method, 'GET');
		strictEqual(handler.urlPath, '/');
		strictEqual(handler.status, 404);
		strictEqual(handler.file, null);
	});
});

suite('RequestHandler.process', async () => {
	const test_files = {
		'.gitignore': '*.html\n',
		'index.html': '<h1>Hello World</h1>',
		'manifest.json': '{"hello": "world"}',
		'README.md': '# Cool stuff\n',
		'section/.htaccess': '# secret',
		'section/favicon.svg': await readPkgFile('lib/assets/favicon-list.svg'),
		'section/index.html': '<h1>Section</h1>',
		'section/other-page.html': '<h1>Other page</h1>',
		'section/page.html': '<h1>Cool page</h1>',
		'.well-known/security.txt': '# hello',
		'.well-known/something-else.json': '{"data":{}}',
	};

	const request0 = withHandlerContext(blankOptions, test_files);
	const request = withHandlerContext(defaultOptions, test_files);

	for (const method of ['PUT', 'DELETE']) {
		test(`${method} method is unsupported`, async () => {
			const handler = request(method, '/README.md');
			strictEqual(handler.method, method);
			strictEqual(handler.status, 404);
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

		// Initial status is 404
		strictEqual(handler.method, 'GET');
		strictEqual(handler.status, 404);
		strictEqual(typeof handler.startedAt, 'number');

		// Processing the request finds the index.html file
		await handler.process();
		strictEqual(handler.status, 200);
		strictEqual(handler.file?.kind, 'file');
		strictEqual(handler.file?.localPath, 'index.html');
		strictEqual(handler.error, undefined);
	});

	test('GET returns a directory listing', async () => {
		const dir_list_files = {
			'some-folder/package.json': '{}',
			'some-folder/README.md': '# Hello',
		};
		const parent = file('', 'dir');
		const folder = file('some-folder', 'dir');
		const cases = [
			{ dirList: false, url: '/', status: 404, file: parent },
			{ dirList: false, url: '/some-folder/', status: 404, file: folder },
			{ dirList: true, url: '/', status: 200, file: parent },
			{ dirList: true, url: '/some-folder', status: 200, file: folder },
		];
		for (const { dirList, url, status, file } of cases) {
			const request = withHandlerContext({ ...blankOptions, dirList }, dir_list_files);
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
		const noFile = request('GET', '/does/not/exist');
		await Promise.all([control.process(), noFile.process()]);
		strictEqual(control.status, 200);
		strictEqual(control.file?.localPath, 'index.html');
		strictEqual(noFile.status, 404);
		strictEqual(noFile.file, null);
	});

	test('GET finds .html files without extension', async () => {
		const page1 = request('GET', '/section/page');
		const page2 = request('GET', '/section/other-page');

		await Promise.all([page1.process(), page2.process()]);
		strictEqual(page1.status, 200);
		strictEqual(page1.file?.localPath, 'section/page.html');
		strictEqual(page2.status, 200);
		strictEqual(page2.file?.localPath, 'section/other-page.html');
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
		const request = withHandlerContext(blankOptions, test_files);

		const getReq = request('GET', '/manifest.json', {
			Origin: 'https://example.com',
			'Access-Control-Request-Method': 'GET',
		});
		const preflightReq = request('OPTIONS', '/manifest.json', {
			Origin: 'https://example.com',
			'Access-Control-Request-Method': 'POST',
			'Access-Control-Request-Headers': 'X-Header1',
		});

		await getReq.process();
		await preflightReq.process();

		strictEqual(getReq.status, 200);
		checkHeaders(getReq.headers, {
			'content-type': 'application/json; charset=UTF-8',
			'content-length': '18',
		});

		strictEqual(preflightReq.status, 204);
		checkHeaders(preflightReq.headers, {
			allow: allowMethods,
			'content-length': '0',
		});
	});

	test('CORS headers when enabled', async () => {
		const request = withHandlerContext({ ...blankOptions, cors: true }, test_files);

		const getReq = request('GET', '/manifest.json', {
			Origin: 'https://example.com',
			'Access-Control-Request-Method': 'GET',
		});
		const preflightReq = request('OPTIONS', '/manifest.json', {
			Origin: 'https://example.com',
			'Access-Control-Request-Method': 'POST',
			'Access-Control-Request-Headers': 'X-Header1',
		});

		await getReq.process();
		await preflightReq.process();

		strictEqual(getReq.status, 200);
		checkHeaders(getReq.headers, {
			'access-control-allow-origin': 'https://example.com',
			'content-type': 'application/json; charset=UTF-8',
			'content-length': '18',
		});

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
