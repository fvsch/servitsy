import { strictEqual } from 'node:assert';
import { suite, test } from 'node:test';

import { readPkgJson } from '../lib/fs-utils.js';

suite('package.json', async () => {
	const pkgJson = await readPkgJson();

	test('it has no dependencies', () => {
		const keys = Object.keys(pkgJson);

		// no library dependencies
		strictEqual(keys.includes('dependencies'), false);
		strictEqual(keys.includes('peerDependencies'), false);
		strictEqual(keys.includes('optionalDependencies'), false);

		// only dev dependencies
		strictEqual(keys.includes('devDependencies'), true);
	});
});
