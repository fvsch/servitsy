import { parseHTML } from 'linkedom';
import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { dirListPage, errorPage } from '../lib/pages.js';
import { loc } from './shared.js';

/**
@type {(doc: Document, selector: string) => string | undefined}
*/
function textContent(doc, selector) {
	return doc.querySelector(selector)?.textContent?.trim();
}

/**
@type {(doc: Document, content: { title: string, desc?: string, base?: string }) => void}
*/
function checkTemplate(doc, content) {
	const text = (s = '') => textContent(doc, s);

	strictEqual(typeof doc, 'object');
	strictEqual(doc.doctype?.name, 'html');
	ok(doc.querySelector('link[rel=icon]'));
	ok(doc.querySelector('style'));

	strictEqual(text('title'), content.title);
	strictEqual(text('h1'), content.title);
	if (content.desc) {
		strictEqual(text('body > p'), content.desc);
	}
	if (content.base) {
		strictEqual(doc.querySelector('base')?.getAttribute('href'), content.base);
	}
}

suite('dirListPage', () => {
	const serverOptions = { root: loc.path(), ext: ['.html'] };

	/**
	@type {(data: Parameters<typeof dirListPage>[0]) => Promise<Document>}
	*/
	async function dirListDoc(data) {
		const html = await dirListPage(data, serverOptions);
		return parseHTML(html).document;
	}

	/**
	@type {(doc: Document, shouldExist: boolean) => void}
	*/
	function checkParentLink(doc, shouldExist) {
		const link = doc.querySelector('ul > li:first-child a');
		if (shouldExist) {
			ok(link);
			strictEqual(link.getAttribute('aria-label'), 'Parent directory');
			strictEqual(link.getAttribute('href'), '..');
			strictEqual(link.textContent, '../');
		} else {
			strictEqual(link, null);
		}
	}

	test('empty list page (root)', async () => {
		const doc = await dirListDoc({
			urlPath: '/',
			filePath: loc.path(),
			items: [],
		});
		const list = doc.querySelector('ul');
		checkTemplate(doc, { base: '/', title: 'Index of _servitsy_test_' });
		strictEqual(list?.nodeName, 'UL');
		strictEqual(list?.childElementCount, 0);
		checkParentLink(doc, false);
	});

	test('empty list page (subfolder)', async () => {
		const localPath = 'cool/folder';
		const doc = await dirListDoc({
			urlPath: `/${localPath}`,
			filePath: loc.path(localPath),
			items: [],
		});
		const list = doc.querySelector('ul');

		checkTemplate(doc, { base: '/cool/folder/', title: 'Index of _servitsy_test_/cool/folder' });
		strictEqual(list?.nodeName, 'UL');
		strictEqual(list?.childElementCount, 1);
		checkParentLink(doc, true);
	});

	test('list page with items', async () => {
		const doc = await dirListDoc({
			urlPath: '/section',
			filePath: loc.path('section'),
			items: [
				loc.file('section/  I have spaces  '),
				loc.file('section/.gitignore'),
				loc.file('section/CHANGELOG', loc.file('section/docs/changelog.md')),
				loc.dir('section/Library'),
				loc.file('section/public', loc.dir('section/.vitepress/build')),
				loc.file('section/README.md'),
			],
		});

		checkTemplate(doc, { base: '/section/', title: 'Index of _servitsy_test_/section' });
		checkParentLink(doc, true);

		const items = doc.querySelectorAll('ul > li a');
		strictEqual(items.length, 7);
		const hrefs = [];
		const texts = [];
		for (const child of items) {
			hrefs.push(child.getAttribute('href'));
			texts.push(child.textContent);
		}
		// Items should be sorted by type: directories first, files second
		deepStrictEqual(hrefs, [
			'..',
			'Library',
			'public',
			'%20%20I%20have%20spaces%20%20',
			'.gitignore',
			'CHANGELOG',
			'README.md',
		]);
		deepStrictEqual(texts, [
			'../',
			'Library/',
			'public/',
			'  I have spaces  ',
			'.gitignore',
			'CHANGELOG',
			'README.md',
		]);
	});
});

suite('errorPage', () => {
	/**
	@type {(data: { status: number; urlPath: string }) => Promise<Document>}
	*/
	async function errorDoc(data) {
		const html = await errorPage(data);
		return parseHTML(html).document;
	}

	test('same generic error page for unknown status', async () => {
		const html1 = await errorPage({ status: 0, urlPath: '/error' });
		const html2 = await errorPage({ status: 200, urlPath: '/some/other/path' });
		strictEqual(html1, html2);
	});

	test('generic error page', async () => {
		const doc = await errorDoc({ status: 400, urlPath: '/error' });
		checkTemplate(doc, {
			title: 'Error',
			desc: 'Something went wrong',
		});
	});

	test('404 error page', async () => {
		const doc = await errorDoc({ status: 404, urlPath: '/does/not/exist' });
		checkTemplate(doc, {
			title: '404: Not found',
			desc: 'Could not find /does/not/exist',
		});
	});

	test('403 error page', async () => {
		const doc = await errorDoc({ status: 403, urlPath: '/no/access' });
		checkTemplate(doc, {
			title: '403: Forbidden',
			desc: 'Could not access /no/access',
		});
	});

	test('500 error page', async () => {
		const doc = await errorDoc({ status: 500, urlPath: '/oh/noes' });
		checkTemplate(doc, {
			title: '500: Error',
			desc: 'Could not serve /oh/noes',
		});
	});
});
