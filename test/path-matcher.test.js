import { deepStrictEqual, strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { PathMatcher } from '../lib/path-matcher.js';

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
