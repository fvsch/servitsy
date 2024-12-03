import { parseHTML } from 'linkedom';
import { expect, suite, test } from 'vitest';

import { dirListPage, errorPage } from '../src/pages.ts';
import { loc } from './shared.ts';

function $template(doc: Document, content: { title: string; desc?: string; base?: string }) {
	const text = (selector: string) => doc.querySelector(selector)?.textContent?.trim();

	expect(doc ?? undefined).toBeTypeOf('object');
	expect(doc.doctype?.name).toBe('html');
	expect(doc.querySelector('link[rel=icon]')).toBeTruthy();
	expect(doc.querySelector('style')).toBeTruthy();

	expect(text('title')).toBe(content.title);
	expect(text('h1')).toBe(content.title);
	if (content.desc) {
		expect(text('body > p')).toBe(content.desc);
	}
	if (content.base) {
		expect(doc.querySelector('base')?.getAttribute('href')).toBe(content.base);
	}
}

suite('dirListPage', () => {
	const serverOptions = { root: loc.path(), ext: ['.html'] };

	function dirListDoc(data: Omit<Parameters<typeof dirListPage>[0], 'root' | 'ext'>): Document {
		const html = dirListPage({ ...serverOptions, ...data });
		return parseHTML(html).document;
	}

	function $list(doc: Document, expectedCount: number) {
		const list = doc.querySelector('ul');
		expect(list, 'List exists').toBeTruthy();
		expect(list?.nodeName).toBe('UL');
		expect(list?.childElementCount, `List has ${expectedCount} items`).toBe(expectedCount);
	}

	function $parentLink(doc: Document, shouldExist: boolean) {
		const link = doc.querySelector('ul > li:first-child a');
		if (shouldExist) {
			expect(link).toBeTruthy();
			expect(link?.getAttribute('aria-label')).toBe('Parent directory');
			expect(link?.getAttribute('href')).toBe('../');
			expect(link?.textContent).toBe('../');
		} else {
			expect(link).toBe(null);
		}
	}

	test('empty list page (root)', async () => {
		const doc = dirListDoc({
			urlPath: '/',
			filePath: loc.path(),
			items: [],
		});

		$template(doc, { base: '/', title: 'Index of _servitsy_test_' });
		$list(doc, 0);
		$parentLink(doc, false);
	});

	test('empty list page (subfolder)', async () => {
		const localPath = 'cool/folder';
		const doc = dirListDoc({
			urlPath: `/${localPath}`,
			filePath: loc.path(localPath),
			items: [],
		});

		$template(doc, { base: '/cool/folder/', title: 'Index of _servitsy_test_/cool/folder' });
		$list(doc, 1);
		$parentLink(doc, true);
	});

	test('list page with items', async () => {
		const doc = dirListDoc({
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

		$template(doc, { base: '/section/', title: 'Index of _servitsy_test_/section' });
		$list(doc, 7);
		$parentLink(doc, true);

		const links: Record<'href' | 'text', string | null>[] = [];
		for (const link of doc.querySelectorAll('ul > li a')) {
			links.push({ href: link.getAttribute('href'), text: link.textContent });
		}

		// Items should be sorted by type: directories first, files second
		expect(links).toEqual([
			{ href: '../', text: '../' },
			{ href: 'Library/', text: 'Library/' },
			{ href: 'public/', text: 'public/' },
			{ href: '%20%20I%20have%20spaces%20%20', text: '  I have spaces  ' },
			{ href: '.gitignore', text: '.gitignore' },
			{ href: 'CHANGELOG', text: 'CHANGELOG' },
			{ href: 'README.md', text: 'README.md' },
		]);
	});
});

suite('errorPage', () => {
	function errorDoc(data: { status: number; urlPath: string | null }): Document {
		const html = errorPage({ ...data, url: data.urlPath ?? '<unknown>' });
		return parseHTML(html).document;
	}

	test('same generic error page for unknown status', async () => {
		const html1 = errorPage({
			status: 0,
			url: '/error',
			urlPath: '/error',
		});
		const html2 = errorPage({
			status: 200,
			url: '/some/other/path',
			urlPath: '/some/other/path',
		});
		expect(html1).toBe(html2);
	});

	test('generic error page', async () => {
		const doc = errorDoc({ status: 499, urlPath: '/error' });
		$template(doc, {
			title: 'Error',
			desc: 'Something went wrong',
		});
	});

	test('400 error page', async () => {
		const doc = errorDoc({ status: 400, urlPath: null });
		$template(doc, {
			title: '400: Bad request',
			desc: 'Invalid request for <unknown>',
		});
	});

	test('404 error page', async () => {
		const doc = errorDoc({ status: 404, urlPath: '/does/not/exist' });
		$template(doc, {
			title: '404: Not found',
			desc: 'Could not find /does/not/exist',
		});
	});

	test('403 error page', async () => {
		const doc = errorDoc({ status: 403, urlPath: '/no/access' });
		$template(doc, {
			title: '403: Forbidden',
			desc: 'Could not access /no/access',
		});
	});

	test('500 error page', async () => {
		const doc = errorDoc({ status: 500, urlPath: '/oh/noes' });
		$template(doc, {
			title: '500: Error',
			desc: 'Could not serve /oh/noes',
		});
	});
});
