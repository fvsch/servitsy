import { afterAll, expect, suite, test } from 'vitest';

import { FileResolver } from '../src/resolver.ts';
import type { FSLocation } from '../src/types.d.ts';
import { getLocalPath } from '../src/utils.ts';
import { fsFixture, getDefaultOptions, loc, platformSlash } from './shared.ts';

class TestFileResolver extends FileResolver {
	$allowed = (filePath: string, expected: boolean) => {
		expect(this.allowedPath(filePath)).toBe(expected);
	};
	$find = async (localPath: string, expected: { status: number; file: FSLocation | null }) => {
		expect(await this.find(localPath)).toEqual(expected);
	};
	$index = async (dirPath: string, expected: FSLocation[]) => {
		expect(await this.index(dirPath)).toEqual(expected);
	};
	$locate = async (filePath: string, expected: FSLocation) => {
		expect(await this.locateFile(filePath)).toEqual(expected);
	};
}

suite('FileResolver.#root', () => {
	const { path } = loc;

	test('throws when root is not defined', () => {
		expect(() => {
			// @ts-expect-error
			new FileResolver({});
		}).toThrow(/Missing root directory/);
	});

	test('withinRoot', () => {
		const resolver = new FileResolver({ root: path() });
		expect(resolver.withinRoot(path`index.html`)).toBe(true);
		expect(resolver.withinRoot(path`some/dir`)).toBe(true);
		expect(resolver.withinRoot(path`../../.zshrc`)).toBe(false);
		expect(resolver.withinRoot(path`/etc/hosts`)).toBe(false);
	});
});

suite('FileResolver.locateFile', async () => {
	const { fileTree, fixture, path, file, dir } = await fsFixture({
		'index.html': '<h1>Hello</h1>',
		'page1.html': '<h1>Page 1</h1>',
		'section1/index.html': '',
		'section2/sub-page/hello.txt': 'Hello!',
	});

	afterAll(() => fixture.rm());

	test('locates exact paths', async () => {
		const { $locate } = new TestFileResolver({
			root: path(),
			ext: [],
			index: [],
		});

		for (const localFilePath of Object.keys(fileTree)) {
			await $locate(path(localFilePath), file(localFilePath));
		}
		for (const localDirPath of ['section1', 'section2', 'section2/sub-page']) {
			await $locate(path(localDirPath), dir(localDirPath));
		}
	});

	test('locates variants with options.ext', async () => {
		const { $locate } = new TestFileResolver({
			root: path(),
			ext: ['.html', '.txt'],
		});

		await $locate(path``, dir(''));
		await $locate(path`section1`, dir('section1'));
		await $locate(path`section2/sub-page`, dir('section2/sub-page'));
		await $locate(path`index`, file('index.html'));
		await $locate(path`page1`, file('page1.html'));
		await $locate(path`section1/index`, file('section1/index.html'));
		await $locate(path`section2/sub-page/hello`, file('section2/sub-page/hello.txt'));
	});

	test('locates variants with options.index', async () => {
		const { $locate } = new TestFileResolver({
			root: path(),
			index: ['index.html'],
		});

		// finds index files
		await $locate(path``, file('index.html'));
		await $locate(path`section1`, file('section1/index.html'));

		// does not add .html or find non-index children
		await $locate(path`page1`, {
			filePath: path`page1`,
			kind: null,
		});
		await $locate(path`section2/sub-page`, dir('section2/sub-page'));
	});
});

suite('FileResolver.#options', () => {
	const { path } = loc;

	test('options: exclude', () => {
		const { $allowed } = new TestFileResolver({
			root: path(),
			exclude: ['.*', '*.md'],
		});

		// should be allowed
		$allowed(path`robots.txt`, true);
		$allowed(path`_._`, true);
		$allowed(path`README.md.backup`, true);

		// should be blocked
		$allowed(path`.env.production`, false);
		$allowed(path`src/components/.gitignore`, false);
		$allowed(path`README.md`, false);
	});

	test('options: exclude + include (custom)', () => {
		const { $allowed } = new TestFileResolver({
			root: path(),
			exclude: ['*.html', '!index.*'],
		});

		$allowed(path`page.html`, false);
		$allowed(path`some/dir/hello.html`, false);
		$allowed(path`index.html`, true);
		$allowed(path`some/dir/index.html`, true);
	});

	test('options: exclude + include (defaults)', async () => {
		const { $allowed } = new TestFileResolver(getDefaultOptions());

		// paths that should be allowed with defaults
		$allowed(path`index.html`, true);
		$allowed(path`page1.html`, true);
		$allowed(path`some-dir/index.html`, true);
		$allowed(path`some/!!!!/(dir)/+[page]2.html`, true);
		$allowed(path`.well-known/security.txt`, true);

		// paths that should be blocked with defaults
		$allowed(path`.htpasswd`, false);
		$allowed(path`.gitignore`, false);
		$allowed(path`.git/config`, false);
		$allowed(path`some/!!!!/(dir)/.htaccess`, false);
	});
});

suite('FileResolver.find', async () => {
	const { fixture, path, file, dir } = await fsFixture({
		'.env': '',
		'.htpasswd': '',
		'.well-known/security.txt': '',
		'about.md': '',
		'index.html': '',
		'page1.html': '',
		'page2.htm': '',
		'section/.gitignore': '',
		'section/index.html': '',
		'section/page.md': '',
	});
	const minimalOptions = { root: path() };
	const defaultOptions = getDefaultOptions(path());

	afterAll(() => fixture.rm());

	test('finds file with exact path', async () => {
		const { $find } = new TestFileResolver(minimalOptions);
		for (const localPath of ['.htpasswd', 'page2.htm', 'section/page.md']) {
			await $find(localPath, { status: 200, file: file(localPath) });
		}
	});

	test('finds folder with exact path', async () => {
		const { $find } = new TestFileResolver({ ...minimalOptions, dirList: true });
		for (const localPath of ['section', '/section/']) {
			await $find(localPath, { status: 200, file: dir('section') });
		}
	});

	test('non-existing paths have a 404 status', async () => {
		const { $find } = new TestFileResolver(minimalOptions);
		for (const localPath of ['README.md', 'section/other-page']) {
			await $find(localPath, { status: 404, file: null });
		}
	});

	test('default options block dotfiles', async () => {
		const resolver = new TestFileResolver(defaultOptions);
		const check = async (url: string, expected: string) => {
			const { status, file } = await resolver.find(url);
			const result = `${status} ${file ? getLocalPath(defaultOptions.root, file.filePath) : null}`;
			expect(result).toBe(platformSlash(expected));
		};

		// non-existing files are always a 404
		await check('doesnt-exist', '404 null');
		await check('.doesnt-exist', '404 null');

		// existing dotfiles are excluded by default pattern
		await check('.env', '404 .env');
		await check('.htpasswd', '404 .htpasswd');
		await check('section/.gitignore', '404 section/.gitignore');

		// Except the .well-known folder, allowed by default
		await check('.well-known', '200 .well-known');
		await check('.well-known/security.txt', '200 .well-known/security.txt');
	});

	test('default options resolve index.html', async () => {
		const { $find } = new TestFileResolver(defaultOptions);
		await $find('', { status: 200, file: file('index.html') });
		for (const localPath of ['section', '/section/']) {
			await $find(localPath, { status: 200, file: file('section/index.html') });
		}
	});

	test('default options resolve .html extension', async () => {
		const { $find } = new TestFileResolver(defaultOptions);

		// adds .html
		for (const localPath of ['index', 'page1', 'section/index']) {
			await $find(localPath, {
				status: 200,
				file: file(`${localPath}.html`),
			});
		}

		// doesn't add other extensions
		for (const localPath of ['about', 'page2', 'section/page']) {
			await $find(localPath, {
				status: 404,
				file: null,
			});
		}
	});
});

suite('FileResolver.index', async () => {
	const { fixture, path, file, dir } = await fsFixture({
		'.env': '',
		'index.html': '',
		'products.html': '',
		'about-us.html': '',
		'.well-known/security.txt': '',
		'section/.gitignore': '',
		'section/page.md': '',
		'section/forbidden.json': '',
		'section/index.html': '',
	});
	const defaultOptions = getDefaultOptions(path());

	afterAll(() => fixture.rm());

	test('does not index directories when options.dirList is false', async () => {
		const { $index } = new TestFileResolver({ ...defaultOptions, dirList: false });
		await $index(path``, []);
		await $index(path`section`, []);
		await $index(path`doesnt-exist`, []);
	});

	test('indexes directories when options.dirList is true', async () => {
		const { $index } = new TestFileResolver({ ...defaultOptions, dirList: true });
		await $index(path``, [
			dir('.well-known'),
			file('about-us.html'),
			file('index.html'),
			file('products.html'),
			dir('section'),
		]);
		await $index(path`section`, [
			file('section/forbidden.json'),
			file('section/index.html'),
			file('section/page.md'),
		]);
	});
});
