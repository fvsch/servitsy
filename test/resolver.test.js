import { deepStrictEqual, strictEqual, throws } from 'node:assert';
import { join, resolve } from 'node:path';
import { cwd } from 'node:process';
import { suite, test } from 'node:test';

import { DIR_FILE_DEFAULT, EXTENSIONS_DEFAULT, FILE_EXCLUDE_DEFAULT } from '../lib/constants.js';
import { FileResolver, PathMatcher } from '../lib/resolver.js';

/**
@typedef {import('../lib/types.js').FSUtils} FSUtils
@typedef {import('../lib/types.js').ResolveOptions} ResolveOptions
@typedef {{path: string; kind: 'dir' | 'file', readable: boolean}} VFile
**/

function root(localPath = '') {
	const _root = join(cwd(), 'tmp/test-path');
	return resolve(_root, localPath);
}

/** @type {ResolveOptions} */
const defaultResolveOptions = {
	root: root(),
	dirFile: [...DIR_FILE_DEFAULT],
	dirList: true,
	ext: [...EXTENSIONS_DEFAULT],
	exclude: [...FILE_EXCLUDE_DEFAULT],
};

/**
@type {(filePaths: Record<string, boolean>) => FSUtils}
*/
function getFsUtils(filePaths) {
	/** @type {Map<string, VFile>} */
	const vfs = new Map();

	// add root dir
	vfs.set(root(''), { path: root(''), kind: 'dir', readable: true });

	// add dirs and files
	for (const [key, readable] of Object.entries(filePaths)) {
		const filePath = key.replace(/^\//, '').replace(/\/$/, '');

		/** @type {string[]} */
		const paths = [];
		for (const segment of filePath.split('/')) {
			const prev = paths.at(-1);
			paths.push(prev ? `${prev}/${segment}` : segment);
		}

		for (const path of paths) {
			const isDir = filePath.startsWith(`${path}/`);
			const fullPath = root(path);
			if (vfs.has(fullPath)) continue;
			vfs.set(fullPath, {
				path: fullPath,
				kind: isDir ? 'dir' : 'file',
				readable: isDir ? true : readable,
			});
		}
	}

	return {
		async index(dirPath) {
			if (!vfs.has(dirPath) || vfs.get(dirPath)?.kind !== 'dir') return [];
			const prefix = `${dirPath}/`;
			const entries = [];
			for (const entry of vfs.values()) {
				if (!entry.path.startsWith(prefix)) continue;
				const relative = entry.path.slice(prefix.length);
				if (!relative.includes('/')) {
					entries.push({ filePath: entry.path, kind: entry.kind });
				}
			}
			return entries;
		},
		async info(filePath) {
			const kind = await this.kind(filePath);
			const readable = await this.readable(filePath);
			return { filePath, kind, readable };
		},
		async kind(filePath) {
			return vfs.get(filePath)?.kind ?? null;
		},
		async readable(filePath) {
			return vfs.get(filePath)?.readable ?? false;
		},
	};
}

/**
@type {(options?: Partial<ResolveOptions>, files?: Record<string, boolean>) => FileResolver}
*/
function getResolver(options = {}, files = {}) {
	return new FileResolver(
		{
			root: options.root ?? root(''),
			...options,
		},
		getFsUtils(files),
	);
}

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
			new FileResolver(
				// @ts-expect-error
				{},
				getFsUtils({}),
			);
		}, /Missing root directory/);
	});

	test('withinRoot', () => {
		const resolver = getResolver();
		const withinRoot = (p = '') => resolver.withinRoot(root(p));

		strictEqual(withinRoot('index.html'), true);
		strictEqual(withinRoot('some/dir'), true);
		strictEqual(withinRoot('../../.zshrc'), false);
		strictEqual(withinRoot('/etc/hosts'), false);
	});
});

suite('FileResolver.urlToTargetPath', () => {
	test('urlToTargetPath', () => {
		const resolver = getResolver();
		strictEqual(resolver.urlToTargetPath('/test'), root('test'));
		strictEqual(resolver.urlToTargetPath('../test'), root('test'));

		// FIXME: broken
		// strictEqual(resolver.urlToTargetPath('//test'), root('test'));
		// strictEqual(resolver.urlToTargetPath('///test'), root('test'));
	});
});

suite('FileResolver.locateFile', () => {
	const locate_files = {
		'index.html': true,
		'page1.html': true,
		'section1/index.html': true,
		'section2/sub-page/hello.txt': false,
	};

	test('locates exact paths', async () => {
		const resolver = getResolver({ ext: [], dirFile: [] }, locate_files);

		for (const file of Object.keys(locate_files)) {
			const filePath = root(file);
			deepStrictEqual(await resolver.locateFile(filePath), { kind: 'file', filePath });
		}

		for (const dir of ['section1', 'section2', 'section2/sub-page']) {
			const filePath = root(dir);
			deepStrictEqual(await resolver.locateFile(filePath), { kind: 'dir', filePath });
		}
	});

	test('locates variants with options.ext', async () => {
		const resolver = getResolver({ ext: ['.html', '.txt'] }, locate_files);

		const expectTargetToDir = {
			'': '',
			section1: 'section1',
			'section2/sub-page': 'section2/sub-page',
		};

		for (const [query, expected] of Object.entries(expectTargetToDir)) {
			deepStrictEqual(await resolver.locateFile(root(query)), {
				kind: 'dir',
				filePath: root(expected),
			});
		}

		const expectTargetToFile = {
			index: 'index.html',
			page1: 'page1.html',
			'section1/index': 'section1/index.html',
			'section2/sub-page/hello': 'section2/sub-page/hello.txt',
		};

		for (const [query, expected] of Object.entries(expectTargetToFile)) {
			deepStrictEqual(await resolver.locateFile(root(query)), {
				kind: 'file',
				filePath: root(expected),
			});
		}
	});

	test('locates variants with options.dirFile', async () => {
		const resolver = getResolver({ dirFile: ['index.html'] }, locate_files);
		const locate = (p = '') => resolver.locateFile(root(p));

		// finds dirFile
		deepStrictEqual(await locate(''), {
			kind: 'file',
			filePath: root('index.html'),
		});
		deepStrictEqual(await locate('section1'), {
			kind: 'file',
			filePath: root('section1/index.html'),
		});

		// does not add .html or find non-dirFile children
		deepStrictEqual(await locate('page1'), {
			kind: null,
			filePath: root('page1'),
		});
		deepStrictEqual(await locate('section2/sub-page'), {
			kind: 'dir',
			filePath: root('section2/sub-page'),
		});
	});
});

suite('FileResolver.#options', () => {
	test('options: exclude', () => {
		const resolver = getResolver({ exclude: ['.*', '*.md'] });
		const allowed = (p = '') => resolver.allowedPath(root(p));

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
		const resolver = getResolver({ exclude: ['*.html', '!index.*'] });
		const allowed = (p = '') => resolver.allowedPath(root(p));

		strictEqual(allowed('page.html'), false);
		strictEqual(allowed('some/dir/hello.html'), false);
		strictEqual(allowed('index.html'), true);
		strictEqual(allowed('some/dir/index.html'), true);
	});

	test('options: exclude + include (defaults)', async () => {
		const resolver = getResolver(defaultResolveOptions);
		const allowed = (p = '') => resolver.allowedPath(root(p));

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

suite('FileResolver.find', () => {
	const find_files = {
		'.env': true,
		'.htpasswd': true,
		'.well-known/security.txt': true,
		'about.md': true,
		'index.html': true,
		'page1.html': true,
		'page2.htm': true,
		'secrets.json': false,
		'section/.gitignore': true,
		'section/index.html': true,
		'section/page.md': true,
		'section/forbidden.json': false,
	};

	test('find file with exact path', async () => {
		const resolver = getResolver({}, find_files);

		for (const [file, readable] of Object.entries(find_files)) {
			const url = `/${file}`;
			deepStrictEqual(await resolver.find(url), {
				urlPath: url,
				status: readable ? 200 : 403,
				filePath: root(file),
				kind: 'file',
			});
		}
	});

	test('find folder with exact path', async () => {
		const resolver = getResolver({}, find_files);

		for (const urlPath of ['/section', '/section/']) {
			deepStrictEqual(await resolver.find(urlPath), {
				urlPath,
				filePath: root('section'),
				kind: 'dir',
				status: 200,
			});
		}
	});

	test('non-existing paths have a 404 status', async () => {
		const resolver = getResolver({}, find_files);

		for (const urlPath of ['/README.md', '/section/other-page']) {
			deepStrictEqual(await resolver.find(urlPath), {
				urlPath,
				status: 404,
				filePath: null,
				kind: null,
			});
		}
	});

	test('files with insufficient permissions are blocked', async () => {
		const resolver = getResolver({}, find_files);

		for (const file of ['secrets.json', 'section/forbidden.json']) {
			const urlPath = `/${file}`;
			const filePath = root(file);
			deepStrictEqual(await resolver.find(urlPath), {
				urlPath,
				status: 403,
				filePath,
				kind: 'file',
			});
		}
	});

	test('default options block dotfiles', async () => {
		const resolver = getResolver(defaultResolveOptions, find_files);
		const find = (url = '/') =>
			resolver.find(url).then((value) => `${value.status} ${value.filePath}`);

		// non-existing files are always a 404
		strictEqual(await find('/doesnt-exist'), '404 null');
		strictEqual(await find('/.doesnt-exist'), '404 null');

		// existing dotfiles are excluded by default pattern
		strictEqual(await find('/.env'), '404 ' + root('.env'));
		strictEqual(await find('/.htpasswd'), '404 ' + root('.htpasswd'));
		strictEqual(await find('/section/.gitignore'), '404 ' + root('section/.gitignore'));

		// Except the .well-known folder, allowed by default
		strictEqual(await find('/.well-known'), '200 ' + root('.well-known'));
		strictEqual(await find('/.well-known/security.txt'), '200 ' + root('.well-known/security.txt'));
	});

	test('default options resolve index.html', async () => {
		const resolver = getResolver(defaultResolveOptions, find_files);

		deepStrictEqual(await resolver.find('/'), {
			urlPath: '/',
			status: 200,
			filePath: root('index.html'),
			kind: 'file',
		});
		for (const urlPath of ['/section', '/section/']) {
			deepStrictEqual(await resolver.find(urlPath), {
				urlPath,
				status: 200,
				filePath: root('section/index.html'),
				kind: 'file',
			});
		}
	});

	test('default options resolve .html extension', async () => {
		const resolver = getResolver(defaultResolveOptions, find_files);

		// adds .html
		for (const fileLike of ['index', 'page1', 'section/index']) {
			const urlPath = `/${fileLike}`;
			const filePath = root(`${fileLike}.html`);
			deepStrictEqual(await resolver.find(urlPath), {
				urlPath,
				status: 200,
				filePath,
				kind: 'file',
			});
		}

		// doesn't add other extensions
		for (const fileLike of ['page2', 'section/page']) {
			const urlPath = `/${fileLike}`;
			deepStrictEqual(await resolver.find(urlPath), {
				urlPath,
				status: 404,
				filePath: null,
				kind: null,
			});
		}
	});
});

suite('FileResolver.index', () => {
	const index_files = {
		'.env': true,
		'index.html': true,
		'products.html': true,
		'about-us.html': true,
		'.well-known/security.txt': true,
		'section/.gitignore': true,
		'section/page.md': true,
		'section/forbidden.json': false,
		'section/index.html': true,
	};

	test('does not index directories when options.dirList is false', async () => {
		const resolver = getResolver({ ...defaultResolveOptions, dirList: false }, index_files);
		deepStrictEqual(await resolver.index(root()), []);
		deepStrictEqual(await resolver.index(root('section')), []);
		deepStrictEqual(await resolver.index(root('doesnt-exist')), []);
	});

	test('indexes directories when options.dirList is true', async () => {
		const resolver = getResolver({ ...defaultResolveOptions }, index_files);
		deepStrictEqual(await resolver.index(root()), [
			{ filePath: root('.well-known'), kind: 'dir' },
			{ filePath: root('about-us.html'), kind: 'file' },
			{ filePath: root('index.html'), kind: 'file' },
			{ filePath: root('products.html'), kind: 'file' },
			{ filePath: root('section'), kind: 'dir' },
		]);

		deepStrictEqual(await resolver.index(root('section')), [
			{ filePath: root('section/forbidden.json'), kind: 'file' },
			{ filePath: root('section/index.html'), kind: 'file' },
			{ filePath: root('section/page.md'), kind: 'file' },
		]);
	});
});
