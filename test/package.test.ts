import { createRequire } from 'node:module';
import { expect, suite, test } from 'vitest';

suite('package.json', async () => {
	const pkg = createRequire(import.meta.url)('../package.json');

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
