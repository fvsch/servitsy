import { expect, suite, test } from 'vitest';

import { readPkgJson } from '#src/fs-utils.js';

suite('package.json', async () => {
	const pkg = readPkgJson();

	test('it has a version number', () => {
		expect(pkg).toBeInstanceOf(Object);
		expect(pkg.version).toMatch(/^\d+\.\d+\./);
	});

	test('it has no dependencies', () => {
		const keys = Object.keys(pkg);

		// only dev dependencies
		expect(keys).toContain('devDependencies');

		// no library dependencies
		expect(keys).not.toContain('dependencies');
		expect(keys).not.toContain('peerDependencies');
		expect(keys).not.toContain('optionalDependencies');
	});
});
