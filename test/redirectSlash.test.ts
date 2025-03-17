import { expect, suite, test } from 'vitest';

import type { FSLocation, TrailingSlash } from '../src/types.d.ts';
import { fwdSlash, trimSlash } from '../src/utils.ts';

/*

For a HTML file with a relative link of href="./other",
assuming the two files are in the same folder:

Files: index.html & other.html [0]
URLs:  / & /other [0]
Result: /

Files:  page.html & other.html [0]
URLs:   /page.html & /other [0]
Rule:   if file and url depth match, do not add trailing slash
Or:     if file was matched directly, NO trailing slash
Result: /page.html

Files:  page.html & other.html [0]
URLs:   /page.html/ & /page.html/other [1]
Rule:   if url depth is higher than file depth by one, remove trailing slash
Or:     if file was matched directly, NO trailing slash
Result: /page.html

Files:  page.html & other.html [0]
URLs:   /page & /other [0]
Rule:   if file and url depth match, do not add trailing slash
Or:     if file was matched by adding extension, NO trailing slash
Result: /page

Files:  page.html & other.html [0]
URLs:   /page/ & /page/other [1]
Rule:   if url depth is higher than file depth by one, remove trailing slash
Or:     if file was matched by adding extension, NO trailing slash
Result: /page

Files:  page/index.html & page/other.html [1]
URLs:   /page & /other [0]
Rule:   if url depth is lower than file depth by one, add trailing slash
Or:     if file was matched by adding index filename, USE trailing slash
Result: /page/

Files:  page/index.html & page/other.html [1]
URLs:   /page/ & /page/other [1]
Rule:   if file and url depth match, do not remove trailing slash
Or:     if file was matched by adding index filename, USE trailing slash
Result: /page/

Files:  page/index.html & page/other.html [1]
URLs:   /page/index & /page/other [1]
Rule:   if file and url depth match, do not add trailing slash
Or:     if file was matched by adding extension, NO trailing slash
Result: /page/index

Files:  page/index.html & page/other.html [1]
URLs:   /page/index/ & /page/index/other [2]
Rule:   if url depth is higher than file depth, remove trailing slash
Or:     if file was matched by adding extension, NO trailing slash
Result: /page/index

*/

function redirectSlash(mode: TrailingSlash, url: URL, localPath: string): string | undefined {
	if (mode === 'ignore' || !localPath) return;
	let urlPath = url.pathname.replace(/\/{2,}/, '/');
	if (urlPath.length < 2) return;

	const trailing = urlPath.endsWith('/');
	if (mode === 'always' && trailing) return;
	if (mode === 'never' && !trailing) return;

	const uPath = trimSlash(urlPath);
	const uEnd = uPath.includes('/') ? uPath.slice(uPath.lastIndexOf('/')) : uPath;
	const lPath = trimSlash(fwdSlash(localPath));
	const lEnd = lPath.includes('/') ? lPath.slice(lPath.lastIndexOf('/')) : lPath;

	if (mode === 'always') {
		if (uPath === lPath || trailing) return;
		urlPath += '/';
	}

	if (mode === 'never') {
		if (!trailing) return;
		urlPath = trimSlash(urlPath, { end: true });
	}

	if (mode === 'auto') {
		const uparts = trimSlash(url.pathname).split('/').filter(Boolean);
		const fparts = trimSlash(fwdSlash(localPath)).split('/').filter(Boolean);

		// if url depth is higher than file depth by one, remove trailing slash
		if (trailing && (uparts.length - fparts.length === 1)) {
			//urlPath = trimSlash(urlPath, { end: true });
		}

		if (localPath.endsWith('page.html') && urlPath.endsWith('page/')) {
			console.log({
				localPath,
				fparts,
				urlPath,
				uparts,
			})
		}
	}

	if (urlPath !== url.pathname) {
		return `${urlPath}${url.search}${url.hash}`;
	}
}

suite('redirectSlash', () => {
	const url = (p: string) => new URL(p, 'http://localhost/');
	const getRs = (mode: TrailingSlash) => {
		return (urlPath: string, localPath: string) => redirectSlash(mode, url(urlPath), localPath);
	};
	const rs = (mode: TrailingSlash, urlPath: string, localPath: string) => {
		return getRs(mode)(urlPath, localPath);
	};

	test(`never redirect in 'ignore' mode`, () => {
		const rs = getRs('ignore');
		expect(rs('/test', 'test')).toBe(undefined);
		expect(rs('/test/', 'test')).toBe(undefined);
		expect(rs('/test', 'test/index.html')).toBe(undefined);
		expect(rs('/test/', 'test/index.html')).toBe(undefined);
	});

	test('does not modify an empty path', () => {
		expect(getRs('always')('/', 'index.html')).toBe(undefined);
		expect(getRs('never')('/', 'index.html')).toBe(undefined);
		expect(getRs('auto')('/', 'index.html')).toBe(undefined);
	});

	test(`keeps url query and hash`, () => {
		expect(getRs('always')('/always?a=b&c=d#efgh', 'test')).toBe('/always/?a=b&c=d#efgh');
		expect(getRs('never')('/never/?a=b&c=d#efgh', 'test')).toBe('/never?a=b&c=d#efgh');
	});

	test(`ensure trailing slash in 'always' mode`, () => {
		const rs = getRs('always');
		// has a trailing slash
		expect(rs('/index/', 'index.html')).toBe(undefined);
		expect(rs('/page/', 'page.html')).toBe(undefined);
		expect(rs('/page/', 'page/index.html')).toBe(undefined);
		// no trailing slash but looks like a complete file name
		expect(rs('/index.html', 'index.html')).toBe(undefined);
		expect(rs('/data/test.json', 'data/test.json')).toBe(undefined);
		// missing trailing slash
		expect(rs('/index', 'index.html')).toBe('/index/');
		expect(rs('/page', 'page.html')).toBe('/page/');
		expect(rs('/page', 'page/index.html')).toBe('/page/');
		expect(rs('/page/index', 'page/index.html')).toBe('/page/index/');
	});

	test('url=/index file=index.html', () => {
		expect(rs('always', '/index', 'index.html')).toBe('/index/');
		expect(rs('never', '/index', 'index.html')).toBe(undefined);
		expect(rs('auto', '/index', 'index.html')).toBe(undefined);
	});

	test('url=/page file=page.html', () => {
		expect(rs('always', '/page', 'page.html')).toBe('/page/');
		expect(rs('never', '/page', 'page.html')).toBe(undefined);
		expect(rs('auto', '/page', 'page.html')).toBe(undefined);
	});

	test('url=/page/ file=page.html', () => {
		expect(rs('always', '/page/', 'page.html')).toBe(undefined);
		expect(rs('never', '/page/', 'page.html')).toBe('/page');
		expect(rs('auto', '/page/', 'page.html')).toBe('/page');
	});

	test('url=/page file=page/index.html', () => {
		expect(rs('always', '/page', 'page/index.html')).toBe('/page/');
		expect(rs('never', '/page', 'page/index.html')).toBe(undefined);
		expect(rs('auto', '/page', 'page/index.html')).toBe('/page/');
	});

	test('url=/page/ file=page/index.html', () => {
		expect(rs('always', '/page/', 'page/index.html')).toBe(undefined);
		expect(rs('never', '/page/', 'page/index.html')).toBe('/page');
		expect(rs('auto', '/page/', 'page/index.html')).toBe('/page');
	});

	test('url=/page/index file=page/index.html', () => {
		expect(rs('always', '/page/index', 'page/index.html')).toBe('/page/index/');
		expect(rs('never', '/page/index', 'page/index.html')).toBe(undefined);
		expect(rs('auto', '/page/index', 'page/index.html')).toBe(undefined);
	});
});
