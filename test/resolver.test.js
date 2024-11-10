import { deepStrictEqual, strictEqual, throws } from 'node:assert';
import { after, suite, test } from 'node:test';

import { getLocalPath } from '../lib/fs-utils.js';
import { FileResolver } from '../lib/resolver.js';
import { fsFixture, getDefaultOptions, loc, platformSlash } from './shared.js';

suite('FileResolver.#root', () => {
	const { path } = loc;

	test('throws when root is not defined', () => {
		throws(() => {
			// @ts-expect-error
			new FileResolver({});
		}, /Missing root directory/);
	});

	test('withinRoot', () => {
		const resolver = new FileResolver({ root: path() });
		strictEqual(resolver.withinRoot(path`index.html`), true);
		strictEqual(resolver.withinRoot(path`some/dir`), true);
		strictEqual(resolver.withinRoot(path`../../.zshrc`), false);
		strictEqual(resolver.withinRoot(path`/etc/hosts`), false);
	});
});

suite('FileResolver.locateFile', async () => {
	const { fileTree, fixture, path, file, dir } = await fsFixture({
		'index.html': '<h1>Hello</h1>',
		'page1.html': '<h1>Page 1</h1>',
		'section1/index.html': '',
		'section2/sub-page/hello.txt': 'Hello!',
	});

	after(() => fixture.rm());

	test('locates exact paths', async () => {
		const resolver = new FileResolver({
			root: path(),
			ext: [],
			dirFile: [],
		});
		const locate = (localPath = '') => resolver.locateFile(path(localPath));

		for (const localFilePath of Object.keys(fileTree)) {
			deepStrictEqual(await locate(localFilePath), file(localFilePath));
		}
		for (const localDirPath of ['section1', 'section2', 'section2/sub-page']) {
			deepStrictEqual(await locate(localDirPath), dir(localDirPath));
		}
	});

	test('locates variants with options.ext', async () => {
		const resolver = new FileResolver({
			root: path(),
			ext: ['.html', '.txt'],
		});
		/** @type {(localPath: string, expected: ReturnType<typeof file>) => Promise<void>} */
		const locate = async (localPath, expected) => {
			const filePath = path(localPath);
			const result = await resolver.locateFile(filePath);
			deepStrictEqual(result, expected);
		};

		await locate('', dir(''));
		await locate('section1', dir('section1'));
		await locate('section2/sub-page', dir('section2/sub-page'));
		await locate('index', file('index.html'));
		await locate('page1', file('page1.html'));
		await locate('section1/index', file('section1/index.html'));
		await locate('section2/sub-page/hello', file('section2/sub-page/hello.txt'));
	});

	test('locates variants with options.dirFile', async () => {
		const resolver = new FileResolver({
			root: path(),
			dirFile: ['index.html'],
		});
		/** @type {(localPath: string, expected: ReturnType<typeof file>) => Promise<void>} */
		const locate = async (localPath, expected) => {
			const result = await resolver.locateFile(path(localPath));
			deepStrictEqual(result, expected);
		};

		// finds dirFile
		await locate('', file('index.html'));
		await locate('section1', file('section1/index.html'));

		// does not add .html or find non-dirFile children
		await locate('page1', {
			filePath: path`page1`,
			kind: null,
		});
		await locate('section2/sub-page', {
			filePath: path`section2/sub-page`,
			kind: 'dir',
		});
	});
});

suite('FileResolver.#options', () => {
	const { path } = loc;
	test('options: exclude', () => {
		const resolver = new FileResolver({
			root: path(),
			exclude: ['.*', '*.md'],
		});
		const allowed = (p = '') => resolver.allowedPath(path(p));

		// should be allowed
		strictEqual(allowed('robots.txt'), true);
		strictEqual(allowed('_._'), true);
		strictEqual(allowed('README.md.backup'), true);

		// should be blocked
		strictEqual(allowed('.env.production'), false);
		strictEqual(allowed('src/components/.gitignore'), false);
		strictEqual(allowed('README.md'), false);
	});

	test('options: exclude + include (custom)', () => {
		const resolver = new FileResolver({
			root: path(),
			exclude: ['*.html', '!index.*'],
		});
		const allowed = (p = '') => resolver.allowedPath(path(p));

		strictEqual(allowed('page.html'), false);
		strictEqual(allowed('some/dir/hello.html'), false);
		strictEqual(allowed('index.html'), true);
		strictEqual(allowed('some/dir/index.html'), true);
	});

	test('options: exclude + include (defaults)', async () => {
		const resolver = new FileResolver(getDefaultOptions());
		const allowed = (p = '') => resolver.allowedPath(path(p));

		// paths that should be allowed with defaults
		strictEqual(allowed('index.html'), true);
		strictEqual(allowed('page1.html'), true);
		strictEqual(allowed('some-dir/index.html'), true);
		strictEqual(allowed('some/!!!!/(dir)/+[page]2.html'), true);
		strictEqual(allowed('.well-known/security.txt'), true);

		// paths that should be blocked with defaults
		strictEqual(allowed('.htpasswd'), false);
		strictEqual(allowed('.gitignore'), false);
		strictEqual(allowed('.git/config'), false);
		strictEqual(allowed('some/!!!!/(dir)/.htaccess'), false);
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

	after(() => fixture.rm());

	test('finds file with exact path', async () => {
		const resolver = new FileResolver(minimalOptions);

		for (const localPath of ['.htpasswd', 'page2.htm', 'section/page.md']) {
			deepStrictEqual(await resolver.find(localPath), {
				status: 200,
				file: file(localPath),
			});
		}
	});

	test('finds folder with exact path', async () => {
		const resolver = new FileResolver({ ...minimalOptions, dirList: true });

		for (const localPath of ['section', '/section/']) {
			deepStrictEqual(await resolver.find(localPath), {
				status: 200,
				file: dir('section'),
			});
		}
	});

	test('non-existing paths have a 404 status', async () => {
		const resolver = new FileResolver(minimalOptions);

		for (const localPath of ['README.md', 'section/other-page']) {
			deepStrictEqual(await resolver.find(localPath), {
				status: 404,
				file: null,
			});
		}
	});

	test('default options block dotfiles', async () => {
		const resolver = new FileResolver(defaultOptions);
		const check = async (url = '', expected = '') => {
			const { status, file } = await resolver.find(url);
			const result = `${status} ${file ? getLocalPath(defaultOptions.root, file.filePath) : null}`;
			strictEqual(result, platformSlash(expected));
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
		const resolver = new FileResolver(defaultOptions);

		deepStrictEqual(await resolver.find(''), {
			status: 200,
			file: file('index.html'),
		});

		for (const localPath of ['section', '/section/']) {
			deepStrictEqual(await resolver.find(localPath), {
				status: 200,
				file: file('section/index.html'),
			});
		}
	});

	test('default options resolve .html extension', async () => {
		const resolver = new FileResolver(defaultOptions);

		// adds .html
		for (const localPath of ['index', 'page1', 'section/index']) {
			deepStrictEqual(await resolver.find(localPath), {
				status: 200,
				file: file(`${localPath}.html`),
			});
		}

		// doesn't add other extensions
		for (const localPath of ['about', 'page2', 'section/page']) {
			deepStrictEqual(await resolver.find(localPath), {
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

	after(() => fixture.rm());

	test('does not index directories when options.dirList is false', async () => {
		const resolver = new FileResolver({ ...defaultOptions, dirList: false });
		deepStrictEqual(await resolver.index(path()), []);
		deepStrictEqual(await resolver.index(path`section`), []);
		deepStrictEqual(await resolver.index(path`doesnt-exist`), []);
	});

	test('indexes directories when options.dirList is true', async () => {
		const resolver = new FileResolver({ ...defaultOptions, dirList: true });
		deepStrictEqual(await resolver.index(path()), [
			dir('.well-known'),
			file('about-us.html'),
			file('index.html'),
			file('products.html'),
			dir('section'),
		]);
		deepStrictEqual(await resolver.index(path`section`), [
			file('section/forbidden.json'),
			file('section/index.html'),
			file('section/page.md'),
		]);
	});
});
