import { expect, suite, test } from 'vitest';

import { PathMatcher } from '#src/path-matcher.js';

class TestPathMatcher extends PathMatcher {
	$data = (expected: ReturnType<PathMatcher['data']>) => {
		expect(this.data()).toEqual(expected);
	};
	$path = (path: string, expected: boolean) => {
		expect(this.test(path)).toBe(expected);
	};
}

suite('PathMatcher', () => {
	test('does not match strings when no patterns are provided', () => {
		const { $data, $path } = new TestPathMatcher([]);
		$data({ positive: [], negative: [] });
		$path('foo', false);
		$path('cool/story/bro.md', false);
	});

	test('ignores empty patterns and those containing slashes', () => {
		const { $data, $path } = new TestPathMatcher(['', '!', 'foo/bar', 'foo\\bar']);
		$data({ positive: [], negative: [] });
		$path('', false);
		$path('foo', false);
		$path('bar', false);
		$path('foo/bar', false);
		$path('foo\\bar', false);
	});

	test('patterns may match any path segment', () => {
		const { $data, $path } = new TestPathMatcher(['yes']);
		$data({ positive: ['yes'], negative: [] });
		$path('yes/nope', true);
		// all slashes are treated as path separators
		$path('nope\\yes', true);
		$path('hmm\\nope/never\\maybe/yes\\but/no', true);
	});

	test('patterns without wildcard must match entire segment', () => {
		const { $data, $path } = new TestPathMatcher(['README']);
		$data({ positive: ['README'], negative: [] });
		$path('project/README', true);
		$path('project/README.md', false);
		$path('project/DO_NOT_README', false);
	});

	test('patterns are optionally case-insensitive', () => {
		const patterns = ['*.md', 'TODO'];
		const cs = new TestPathMatcher(patterns, { caseSensitive: true });
		const ci = new TestPathMatcher(patterns, { caseSensitive: false });

		cs.$path('test/dir/README.md', true);
		cs.$path('test/dir/README.MD', false);
		cs.$path('docs/TODO', true);
		cs.$path('docs/todo', false);

		ci.$path('test/dir/README.md', true);
		ci.$path('test/dir/README.MD', true);
		ci.$path('docs/TODO', true);
		ci.$path('docs/todo', true);
	});

	test('wildcard character works', () => {
		const { $path } = new TestPathMatcher(['.env*', '*.secrets', '*config*', '*a*b*c*d*']);
		$path('project/.env', true);
		$path('project/.env.production', true);
		$path('home/.secrets', true);
		$path('home/my.secrets', true);
		$path('home/scrts', false);
		$path('test/config', true);
		$path('test/foo.config.js', true);
		$path('abcd', true);
		$path('abdc', false);
		$path('1(a)[2b]3cccc+4d!!', true);
	});

	test('patterns starting with ! negate a previous match', () => {
		const { $path } = new TestPathMatcher([
			'.env*',
			'!.env.development',
			'!.well-known',
			'.*',
			'_*',
		]);

		// matched by positive rules
		$path('.env', true);
		$path('.environment', true);
		$path('.env.production', true);
		$path('.htaccess', true);
		$path('.htpasswd', true);
		$path('_static', true);

		// negated by ! rules
		$path('.env.development', false);
		$path('.well-known', false);
		$path('.well-known/security.txt', false);

		// if only some matched segments are negated, then it's a match anyway
		$path('.config/.env.development', true);
		$path('_static/.well-known/security.txt', true);
	});
});
