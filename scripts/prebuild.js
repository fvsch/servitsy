import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

main();

async function main() {
	await bundleAssets();
	await cleanLib();
}

/**
Read text files from the assets folder and write
*/
async function bundleAssets() {
	const outPath = pkgFilePath('src/page-assets.ts');
	console.log(`Updating assets bundle:\n  ${outPath}\n`);

	const assets = {
		FAVICON_ERROR: await readPkgFile('assets/favicon-error.svg'),
		FAVICON_LIST: await readPkgFile('assets/favicon-list.svg'),
		ICONS: await readPkgFile('assets/icons.svg'),
		STYLES: await readPkgFile('assets/styles.css'),
	};
	const minify = (input = '') => input.replace(/^\s+/gm, '').trim();
	const escape = (input = '') => input.replace(/\`/g, '\\`');

	const out = Object.entries(assets).map(([key, contents]) => {
		return `export const ${key} = \`${escape(minify(contents))}\`;`;
	});

	await writeFile(outPath, out.join('\n\n') + '\n');
}

async function cleanLib() {
	const libDir = pkgFilePath('lib');
	console.log(`Deleting lib dir:\n  ${libDir}\n`);
	await rm(libDir, { recursive: true, force: true });
}

export function pkgFilePath(localPath = '') {
	return join(import.meta.dirname, '..', localPath);
}

export async function readPkgFile(localPath = '') {
	return readFile(pkgFilePath(localPath), { encoding: 'utf8' });
}
