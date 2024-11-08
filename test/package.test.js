import { match, strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { readPkgJson } from '../lib/fs-utils.js';

suite('package.json', async () => {
	const pkg = readPkgJson();

	test('it has a version number', () => {
		strictEqual(pkg !== null && typeof pkg, 'object');
		match(pkg.version, /^\d+\.\d+\./);
	});

	test('it has no dependencies', () => {
		const keys = Object.keys(pkg);

		// no library dependencies
		strictEqual(keys.includes('dependencies'), false);
		strictEqual(keys.includes('peerDependencies'), false);
		strictEqual(keys.includes('optionalDependencies'), false);

		// only dev dependencies
		strictEqual(keys.includes('devDependencies'), true);
	});
});
