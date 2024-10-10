import { deepStrictEqual, strictEqual, throws } from 'node:assert';
import { after, suite, test } from 'node:test';

import { FileResolver, PathMatcher } from '../lib/resolver.js';
import { fsFixture, getDefaultOptions, testPath } from './shared.js';

suite('PathMatcher', () => {
	test('does not match strings when no patterns are provided', () => {
		const matcher = new PathMatcher([]);
		deepStrictEqual(matcher.rules, { positive: [], negative: [] });
		strictEqual(matcher.test('foo'), false);
		strictEqual(matcher.test('cool/story/bro.md'), false);
	});

	test('ignores empty patterns and those containing slashes', () => {
		const matcher = new PathMatcher(['', '!', 'foo/bar', 'foo\\bar']);
		deepStrictEqual(matcher.rules, { positive: [], negative: [] });
		strictEqual(matcher.test(''), false);
		strictEqual(matcher.test('foo'), false);
		strictEqual(matcher.test('bar'), false);
		strictEqual(matcher.test('foo/bar'), false);
		strictEqual(matcher.test('foo\\bar'), false);
	});

	test('patterns may match every path segment', () => {
		const matcher = new PathMatcher(['yes']);
		strictEqual(matcher.test('yes/nope'), true);
		strictEqual(matcher.test('nope\\yes'), true);
		// all slashes are treated as path separators
		strictEqual(matcher.test('hmm\\nope/never\\maybe/yes\\but/no'), true);
	});

	test('patterns without wildcard must match entire segment', () => {
		const matcher = new PathMatcher(['README']);
		strictEqual(matcher.test('project/README'), true);
		strictEqual(matcher.test('project/README.md'), false);
		strictEqual(matcher.test('project/DO_NOT_README'), false);
	});

	test('patterns are optionally case-insensitive', () => {
		const patterns = ['*.md', 'TODO'];

		const defaultMatcher = new PathMatcher(patterns);
		strictEqual(defaultMatcher.test('test/dir/README.md'), true);
		strictEqual(defaultMatcher.test('test/dir/README.MD'), false);
		strictEqual(defaultMatcher.test('docs/TODO'), true);
		strictEqual(defaultMatcher.test('docs/todo'), false);

		const ciMatcher = new PathMatcher(['*.md', 'TODO'], { caseSensitive: false });
		strictEqual(ciMatcher.test('test/dir/README.md'), true);
		strictEqual(ciMatcher.test('test/dir/README.MD'), true);
		strictEqual(ciMatcher.test('docs/TODO'), true);
		strictEqual(ciMatcher.test('docs/todo'), true);
	});

	test('wildcard character works', () => {
		const matcher = new PathMatcher(['.env*', '*.secrets', '*config*', '*a*b*c*d*']);
		strictEqual(matcher.test('project/.env'), true);
		strictEqual(matcher.test('project/.env.production'), true);
		strictEqual(matcher.test('home/.secrets'), true);
		strictEqual(matcher.test('home/my.secrets'), true);
		strictEqual(matcher.test('home/scrts'), false);
		strictEqual(matcher.test('test/config'), true);
		strictEqual(matcher.test('test/foo.config.js'), true);
		strictEqual(matcher.test('abcd'), true);
		strictEqual(matcher.test('abdc'), false);
		strictEqual(matcher.test('1(a)[2b]3cccc+4d!!'), true);
	});

	test('patterns starting with ! negate a previous match', () => {
		const matcher = new PathMatcher(['.env*', '!.env.development', '!.well-known', '.*', '_*']);

		// matched by positive rules
		strictEqual(matcher.test('.env'), true);
		strictEqual(matcher.test('.environment'), true);
		strictEqual(matcher.test('.env.production'), true);
		strictEqual(matcher.test('.htaccess'), true);
		strictEqual(matcher.test('.htpasswd'), true);
		strictEqual(matcher.test('_static'), true);

		// negated by ! rules
		strictEqual(matcher.test('.env.development'), false);
		strictEqual(matcher.test('.well-known'), false);
		strictEqual(matcher.test('.well-known/security.txt'), false);

		// if only some matched segments are negated, then it's a match anyway
		strictEqual(matcher.test('.config/.env.development'), true);
		strictEqual(matcher.test('_static/.well-known/security.txt'), true);
	});
});

suite('FileResolver.#root', () => {
	test('throws when root is not defined', () => {
		throws(() => {
			// @ts-expect-error
			new FileResolver({});
		}, /Missing root directory/);
	});

	test('withinRoot', () => {
		const resolver = new FileResolver({ root: testPath() });

		strictEqual(resolver.withinRoot(testPath('index.html')), true);
		strictEqual(resolver.withinRoot(testPath('some/dir')), true);
		strictEqual(resolver.withinRoot(testPath('../../.zshrc')), false);
		strictEqual(resolver.withinRoot('/etc/hosts'), false);
	});
});

suite('FileResolver.cleanUrlPath', () => {
	const resolver = new FileResolver({ root: testPath() });
	/** @type {(url: string, expected: string | null) => void} */
	const check = (url = '', expected = '') => strictEqual(resolver.cleanUrlPath(url), expected);

	test('extracts URL pathname', () => {
		check('https://example.com/hello/world', '/hello/world');
		check('/hello/world?cool=test', '/hello/world');
		check('/hello/world#right', '/hello/world');
	});

	test('keeps percent encoding', () => {
		check('/Super%3F%20%C3%89patant%21/', '/Super%3F%20%C3%89patant%21/');
		check('/%E3%82%88%E3%81%86%E3%81%93%E3%81%9D', '/%E3%82%88%E3%81%86%E3%81%93%E3%81%9D');
	});

	test('rejects URLs with forbidden characters in path', () => {
		// cannot run test resolver.cleanUrlPath with literal .. or backslashes
		// because those get resolved by new URL
		check('/_%2F_%2F_', null);
		check('/_%5C_%5C_', null);
		check('/_%2f_%5c_', null);
		check('/_%2E%2E_', null);

		// so let's test the underlying function
		strictEqual(resolver.validateUrlPath('/\\foo/'), false);
		strictEqual(resolver.validateUrlPath('/a\\.\\b'), false);
		strictEqual(resolver.validateUrlPath('/../bar'), false);
		strictEqual(resolver.validateUrlPath('/%2E%2E/bar'), false);
	});
});

suite('FileResolver.locateFile', async () => {
	const { fileTree, fixture, root } = await fsFixture({
		'index.html': '<h1>Hello</h1>',
		'page1.html': '<h1>Page 1</h1>',
		'section1/index.html': '',
		'section2/sub-page/hello.txt': 'Hello!',
	});

	after(() => fixture.rm());

	test('locates exact paths', async () => {
		const resolver = new FileResolver({
			root: root(),
			ext: [],
			dirFile: [],
		});
		const locate = (localPath = '') => resolver.locateFile(root(localPath));

		for (const localFilePath of Object.keys(fileTree)) {
			deepStrictEqual(await locate(localFilePath), {
				kind: 'file',
				filePath: root(localFilePath),
			});
		}

		for (const localDirPath of ['section1', 'section2', 'section2/sub-page']) {
			deepStrictEqual(await locate(localDirPath), {
				kind: 'dir',
				filePath: root(localDirPath),
			});
		}
	});

	test('locates variants with options.ext', async () => {
		const resolver = new FileResolver({ root: root(), ext: ['.html', '.txt'] });
		const locate = (localPath = '') => resolver.locateFile(root(localPath));

		const testCases = [
			{ query: '', expected: '', kind: 'dir' },
			{ query: 'section1', expected: 'section1', kind: 'dir' },
			{ query: 'section2/sub-page', expected: 'section2/sub-page', kind: 'dir' },
			{ query: 'index', expected: 'index.html', kind: 'file' },
			{ query: 'page1', expected: 'page1.html', kind: 'file' },
			{ query: 'section1/index', expected: 'section1/index.html', kind: 'file' },
			{ query: 'section2/sub-page/hello', expected: 'section2/sub-page/hello.txt', kind: 'file' },
		];

		for (const { query, expected, kind } of testCases) {
			deepStrictEqual(await locate(query), { filePath: root(expected), kind });
		}
	});

	test('locates variants with options.dirFile', async () => {
		const resolver = new FileResolver({ root: root(), dirFile: ['index.html'] });
		const locate = (localPath = '') => resolver.locateFile(root(localPath));

		// finds dirFile
		deepStrictEqual(await locate(''), {
			kind: 'file',
			filePath: root`index.html`,
		});
		deepStrictEqual(await locate('section1'), {
			kind: 'file',
			filePath: root`section1/index.html`,
		});

		// does not add .html or find non-dirFile children
		deepStrictEqual(await locate('page1'), {
			kind: null,
			filePath: root`page1`,
		});
		deepStrictEqual(await locate('section2/sub-page'), {
			kind: 'dir',
			filePath: root`section2/sub-page`,
		});
	});
});

suite('FileResolver.#options', () => {
	test('options: exclude', () => {
		const resolver = new FileResolver({
			root: testPath(),
			exclude: ['.*', '*.md'],
		});
		const allowed = (p = '') => resolver.allowedPath(p);

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
			root: testPath(),
			exclude: ['*.html', '!index.*'],
		});
		const allowed = (p = '') => resolver.allowedPath(p);

		strictEqual(allowed('page.html'), false);
		strictEqual(allowed('some/dir/hello.html'), false);
		strictEqual(allowed('index.html'), true);
		strictEqual(allowed('some/dir/index.html'), true);
	});

	test('options: exclude + include (defaults)', async () => {
		const resolver = new FileResolver(getDefaultOptions());
		const allowed = (p = '') => resolver.allowedPath(p);

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
	const { fixture, root, file } = await fsFixture({
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
	const minimalOptions = { root: root() };
	const defaultOptions = getDefaultOptions(root());

	after(() => fixture.rm());

	test('finds file with exact path', async () => {
		const resolver = new FileResolver(minimalOptions);

		for (const localPath of ['.htpasswd', 'page2.htm', 'section/page.md']) {
			const url = `/${localPath}`;
			deepStrictEqual(await resolver.find(url), {
				urlPath: url,
				status: 200,
				file: file(localPath),
			});
		}
	});

	test('finds folder with exact path', async () => {
		const resolver = new FileResolver({ ...minimalOptions, dirList: true });

		for (const urlPath of ['/section', '/section/']) {
			const result = await resolver.find(urlPath);
			deepStrictEqual(result, {
				status: 200,
				urlPath,
				file: file('section', 'dir'),
			});
		}
	});

	test('non-existing paths have a 404 status', async () => {
		const resolver = new FileResolver(minimalOptions);

		for (const urlPath of ['/README.md', '/section/other-page']) {
			deepStrictEqual(await resolver.find(urlPath), {
				urlPath,
				status: 404,
				file: null,
			});
		}
	});

	test('default options block dotfiles', async () => {
		const resolver = new FileResolver(defaultOptions);
		const find = async (url = '/') => {
			const value = await resolver.find(url);
			return `${value.status} ${value.file?.localPath ?? null}`;
		};

		// non-existing files are always a 404
		strictEqual(await find('/doesnt-exist'), '404 null');
		strictEqual(await find('/.doesnt-exist'), '404 null');

		// existing dotfiles are excluded by default pattern
		strictEqual(await find('/.env'), '404 .env');
		strictEqual(await find('/.htpasswd'), '404 .htpasswd');
		strictEqual(await find('/section/.gitignore'), '404 section/.gitignore');

		// Except the .well-known folder, allowed by default
		strictEqual(await find('/.well-known'), '200 .well-known');
		strictEqual(await find('/.well-known/security.txt'), '200 .well-known/security.txt');
	});

	test('default options resolve index.html', async () => {
		const resolver = new FileResolver(defaultOptions);

		deepStrictEqual(await resolver.find('/'), {
			urlPath: '/',
			status: 200,
			file: file('index.html'),
		});

		for (const urlPath of ['/section', '/section/']) {
			deepStrictEqual(await resolver.find(urlPath), {
				urlPath,
				status: 200,
				file: file('section/index.html'),
			});
		}
	});

	test('default options resolve .html extension', async () => {
		const resolver = new FileResolver(defaultOptions);

		// adds .html
		for (const fileLike of ['index', 'page1', 'section/index']) {
			const urlPath = `/${fileLike}`;
			deepStrictEqual(await resolver.find(urlPath), {
				urlPath,
				status: 200,
				file: file(`${fileLike}.html`),
			});
		}

		// doesn't add other extensions
		for (const localPath of ['about', 'page2', 'section/page']) {
			const urlPath = `/${localPath}`;
			deepStrictEqual(await resolver.find(urlPath), {
				urlPath,
				status: 404,
				file: null,
			});
		}
	});
});

suite('FileResolver.index', async () => {
	const { fixture, root, file } = await fsFixture({
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
	const defaultOptions = getDefaultOptions(root());

	after(() => fixture.rm());

	test('does not index directories when options.dirList is false', async () => {
		const resolver = new FileResolver({ ...defaultOptions, dirList: false });
		deepStrictEqual(await resolver.index(root()), []);
		deepStrictEqual(await resolver.index(root`section`), []);
		deepStrictEqual(await resolver.index(root`doesnt-exist`), []);
	});

	test('indexes directories when options.dirList is true', async () => {
		const resolver = new FileResolver({ ...defaultOptions, dirList: true });
		deepStrictEqual(await resolver.index(root()), [
			file('.well-known', 'dir'),
			file('about-us.html'),
			file('index.html'),
			file('products.html'),
			file('section', 'dir'),
		]);
		deepStrictEqual(await resolver.index(root`section`), [
			file('section/forbidden.json'),
			file('section/index.html'),
			file('section/page.md'),
		]);
	});
});
