import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

bundleAssets();

/**
Read text files from the assets folder and write
*/
async function bundleAssets() {
	const outPath = 'lib/page-assets.js';
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

	await writeFile(pkgFilePath(outPath), out.join('\n\n') + '\n');
	console.log('Updated ' + outPath);
}

export function pkgFilePath(localPath = '') {
	const dirname = fileURLToPath(new URL('.', import.meta.url));
	return join(dirname, '..', localPath);
}

export async function readPkgFile(localPath = '') {
	return readFile(pkgFilePath(localPath), { encoding: 'utf8' });
}
