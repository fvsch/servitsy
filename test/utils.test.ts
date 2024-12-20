import { join, sep as dirSep } from 'node:path';
import { expect, suite, test } from 'vitest';

import { loc } from './shared.ts';

import {
	clamp,
	escapeHtml,
	fwdSlash,
	getLocalPath,
	getRuntime,
	headerCase,
	intRange,
	isPrivateIPv4,
	isSubpath,
	PathMatcher,
	trimSlash,
	withResolvers,
} from '../src/utils.ts';

suite('clamp', () => {
	test('keeps the value when between bounds', () => {
		expect(clamp(1, 0, 2)).toBe(1);
		expect(clamp(Math.PI, -10, 10)).toBe(Math.PI);
		expect(clamp(-50, -Infinity, Infinity)).toBe(-50);
		expect(clamp(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, Infinity)).toBe(
			Number.MAX_SAFE_INTEGER,
		);
	});

	test('constrains the value when outside of bounds', () => {
		expect(clamp(-1, 0, 1)).toBe(0);
		expect(clamp(2, -1, 1)).toBe(1);
		expect(clamp(Infinity, 0, Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
		expect(clamp(-Infinity, 0, Number.MAX_SAFE_INTEGER)).toBe(0);

		// maximum wins over minimum
		expect(clamp(5, 10, 0)).toBe(0);
		expect(clamp(50, 10, 0)).toBe(0);
		expect(clamp(0, 10, -10)).toBe(-10);
	});
});

suite('escapeHtml', () => {
	const $text = (input: string, expected: string) => {
		expect(escapeHtml(input, 'text')).toBe(expected);
	};
	const $attr = (input: string, expected: string) => {
		expect(escapeHtml(input, 'attr')).toBe(expected);
	};

	test('escapes & charachters', () => {
		const input = `"Ampersand&Sons"`;
		$text(input, `"Ampersand&amp;Sons"`);
		$attr(input, `&quot;Ampersand&amp;Sons&quot;`);
	});

	test('escapes HTML comments', () => {
		const input = `<!--hmm-->`;
		$text(input, `&lt;!--hmm--&gt;`);
		$attr(input, `&lt;!--hmm--&gt;`);
	});

	test('escapes HTML tags', () => {
		const input = `<script>alert(document.location = "/admin")`;
		$text(input, `&lt;script&gt;alert(document.location = "/admin")`);
		$attr(input, `&lt;script&gt;alert(document.location = &quot;/admin&quot;)`);
	});
});

suite('fwdSlash', () => {
	const $fwd = (input: string, expected: string) => {
		expect(fwdSlash(input)).toBe(expected);
	};

	test('leaves conforming paths untouched', () => {
		const paths = ['hello.jpg', './hello', '/Users/bobesponja/Downloads/invoice.pdf', '/etc/hosts'];
		for (const input of paths) {
			$fwd(input, input);
		}
	});

	test('replaces backwards slashes', () => {
		$fwd('\\hello\\world', '/hello/world');
		$fwd('/mixed\\slashes/around\\here', '/mixed/slashes/around/here');
		$fwd('C:\\Users\\BobEsponja\\Application Data', 'C:/Users/BobEsponja/Application Data');
	});

	test('deduplicates slashes', () => {
		$fwd('//hello', '/hello');
		$fwd('////////', '/');
		$fwd('a//b\\\\//\\c////d', 'a/b/c/d');
	});

	test('keeps trailing slashes', () => {
		$fwd('/hello/', '/hello/');
		$fwd('ok/', 'ok/');
		$fwd('/', '/');
	});
});

suite('getLocalPath', () => {
	const { path } = loc;

	test('returns local path for child path', () => {
		expect(getLocalPath(path``, path``)).toBe('');
		expect(getLocalPath(path`a/b`, path`a/b/c`)).toBe('c');
		expect(getLocalPath(path``, path`a/b/c/e/f/g/h`)).toBe(join('a/b/c/e/f/g/h'));
	});

	test('returns null when file path is not a child path', () => {
		expect(getLocalPath('', '')).toBe(null);
		expect(getLocalPath(path``, path`` + dirSep + '..')).toBe(null);
		expect(getLocalPath(path`some/folder`, path`other/folder`)).toBe(null);
	});
});

suite('getRuntime', () => {
	test('returns a valid string', () => {
		const runtime = getRuntime();
		expect(runtime).toBeTypeOf('string');
		expect(['bun', 'deno', 'node', 'webcontainer']).toContain(runtime);
	});
});

suite('headerCase', () => {
	const $hcase = (input: string, expected: string) => {
		expect(headerCase(input)).toBe(expected);
	};

	test('keeps uppercase values as-is', () => {
		$hcase('A', 'A');
		$hcase('DNT', 'DNT');
		$hcase('COOL_STUFF', 'COOL_STUFF');
	});

	test('keeps upper kebab case values as-is', () => {
		$hcase('A-B-C', 'A-B-C');
		$hcase('Aaa_Bbb_Ccc', 'Aaa_Bbb_Ccc');
		$hcase('Content-Type', 'Content-Type');
		$hcase('Access-Control-Allow-Origin', 'Access-Control-Allow-Origin');
	});

	test('turns lower kebab case to upper kebab case', () => {
		$hcase('allow', 'Allow');
		$hcase('a-b-c', 'A-B-C');
		$hcase('aaa_bbb_ccc', 'Aaa_Bbb_Ccc');
		$hcase('content-type', 'Content-Type');
		$hcase('access-control-allow-origin', 'Access-Control-Allow-Origin');
	});
});

suite('isPrivateIPv4', () => {
	const $private = (ip: string, expected: boolean) => {
		expect(isPrivateIPv4(ip)).toBe(expected);
	};

	test('rejects invalid addresses', () => {
		$private('', false);
		$private('192.168', false);
		$private('192.168.0.1000', false);
	});

	test('rejects addresses out of private ranges', () => {
		$private('0.0.0.0', false);
		$private('11.11.11.11', false);
		$private('172.32.1.1', false);
		$private('255.255.255.255', false);
	});

	test('accepts addresses in private ranges', () => {
		$private('10.0.0.0', true);
		$private('10.10.10.10', true);
		$private('10.255.255.255', true);
		$private('172.16.0.0', true);
		$private('172.24.0.10', true);
		$private('172.31.255.255', true);
		$private('192.168.0.0', true);
		$private('192.168.1.1', true);
		$private('192.168.99.199', true);
		$private('192.168.255.255', true);
	});
});

suite('intRange', () => {
	test('throws for invalid params', () => {
		expect(() => intRange(0.5, 5.5)).toThrow(/Invalid start param: 0.5/);
		expect(() => intRange(1, Infinity)).toThrow(/Invalid end param: Infinity/);
		expect(
			// @ts-ignore
			() => intRange(1, 100, null),
		).toThrow(/Invalid limit param: null/);
	});

	test('increasing sequence', () => {
		expect(intRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
		expect(intRange(-1, 9)).toEqual([-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		expect(intRange(10, 10)).toEqual([10]);
	});

	test('decreasing sequence', () => {
		expect(intRange(1, -5)).toEqual([1, 0, -1, -2, -3, -4, -5]);
		expect(intRange(10, 9)).toEqual([10, 9]);
	});

	test('applies implicit limit', () => {
		const oneThousand = intRange(1, 10_000);
		expect(oneThousand.length).toBe(1000);
		expect(oneThousand.at(500)).toBe(501);
		expect(oneThousand.at(-1)).toBe(1000);
	});

	test('applies explicit limit', () => {
		const limit1 = intRange(1_000_001, 2_000_000, 50);
		expect(limit1.length).toBe(50);
		expect(limit1.at(0)).toBe(1_000_001);
		expect(limit1.at(-1)).toBe(1_000_050);
		const limit2 = intRange(1_000_001, 2_000_000, 0);
		expect(limit2.length).toBe(0);
	});
});

suite('isSubpath', () => {
	const { path } = loc;

	test('rejects invalid paths', () => {
		expect(isSubpath('', '')).toBe(false);
		expect(isSubpath('not/absolute/parent', 'not/absolute/parent/child')).toBe(false);
		expect(isSubpath(path``, [path``, '..', 'test'].join(dirSep))).toBe(false);
		expect(isSubpath(path`some/folder`, path`other/folder`)).toBe(false);
	});

	test('accepts identical paths and child paths', () => {
		expect(isSubpath(path``, path``)).toBe(true);
		expect(isSubpath(path`same/folder`, path`same/folder`)).toBe(true);
		expect(isSubpath(path``, path`hello`)).toBe(true);
		expect(isSubpath(path``, path`hello/world`)).toBe(true);
		expect(isSubpath(path`a/b/c/d`, path`a/b/c/d/e/f/g/h`)).toBe(true);
	});
});

suite('PathMatcher', () => {
	class TestPathMatcher extends PathMatcher {
		$data = (expected: ReturnType<PathMatcher['data']>) => {
			expect(this.data()).toEqual(expected);
		};
		$path = (path: string, expected: boolean) => {
			expect(this.test(path)).toBe(expected);
		};
	}

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

suite('trimSlash', () => {
	const $trim = (input: string, expected: string) => {
		expect(trimSlash(input)).toBe(expected);
	};

	test('trims start and end slashes by default', () => {
		$trim('/hello/', 'hello');
		$trim('\\hello/', 'hello');
		$trim('/hello/world/', 'hello/world');
		$trim('\\hello\\world\\', 'hello\\world');
	});

	test('only trims one slash per edge', () => {
		$trim('/', '');
		$trim('//', '');
		$trim('///', '/');
		$trim('////', '//');
		$trim('///test///', '//test//');
		$trim('\\\\test\\\\', '\\test\\');
	});

	test('edge options default to false when not provided', () => {
		expect(trimSlash('/test/', {})).toBe('/test/');
		expect(trimSlash('/test/', { start: true })).toBe('test/');
		expect(trimSlash('/test/', { end: true })).toBe('/test');
		expect(trimSlash('/test/', { start: true, end: true })).toBe('test');
	});
});

suite('withResolvers', () => {
	test('returns a promise with a resolve function', async () => {
		const { promise, resolve } = withResolvers();
		resolve('TEST');
		await expect(promise).resolves.toBe('TEST');
	});

	test('returns a promise with a reject function', async () => {
		const { promise, reject } = withResolvers();
		reject('TEST REJECTION');
		await expect(promise).rejects.toBe('TEST REJECTION');
	});
});
