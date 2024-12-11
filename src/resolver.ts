import { isAbsolute, join } from 'node:path';

import { getIndex, getKind, getRealpath, isReadable } from './fs-utils.ts';
import type { FSLocation, ServerOptions } from './types.d.ts';
import { getLocalPath, isSubpath, PathMatcher, trimSlash } from './utils.ts';

export class FileResolver {
	#root: string;
	#ext: string[] = [];
	#index: string[] = [];
	#dirList = false;
	#excludeMatcher: PathMatcher;

	constructor(options: ServerOptions) {
		if (typeof options.root !== 'string') {
			throw new Error('Missing root directory');
		} else if (!isAbsolute(options.root)) {
			throw new Error('Expected absolute root path');
		}
		this.#root = trimSlash(options.root, { end: true });

		if (Array.isArray(options.ext)) {
			this.#ext = options.ext;
		}
		if (Array.isArray(options.index)) {
			this.#index = options.index;
		}
		if (typeof options.dirList === 'boolean') {
			this.#dirList = options.dirList;
		}

		this.#excludeMatcher = new PathMatcher(options.exclude ?? [], {
			caseSensitive: true,
		});
	}

	allowedPath(filePath: string): boolean {
		const localPath = getLocalPath(this.#root, filePath);
		if (localPath == null) return false;
		return this.#excludeMatcher.test(localPath) === false;
	}

	async find(localPath: string): Promise<{ status: number; file: FSLocation | null }> {
		const targetPath = this.resolvePath(localPath);
		let file: FSLocation | null = targetPath != null ? await this.locateFile(targetPath) : null;

		// Resolve symlink
		if (file?.kind === 'link') {
			const realPath = await getRealpath(file.filePath);
			const real = realPath != null ? await this.locateFile(realPath) : null;
			if (real?.kind === 'file' || real?.kind === 'dir') {
				file = real;
			}
		}

		// We have a match
		if (file?.kind === 'file' || file?.kind === 'dir') {
			const allowed =
				file.kind === 'dir' && !this.#dirList ? false : this.allowedPath(file.filePath);
			const readable = allowed && (await isReadable(file.filePath, file.kind));
			return { status: allowed ? (readable ? 200 : 403) : 404, file };
		}

		return { status: 404, file: null };
	}

	async index(dirPath: string): Promise<FSLocation[]> {
		if (!this.#dirList) return [];

		const items: FSLocation[] = (await getIndex(dirPath)).filter(
			(item) => item.kind != null && this.allowedPath(item.filePath),
		);

		items.sort((a, b) => a.filePath.localeCompare(b.filePath));

		return Promise.all(
			items.map(async (item) => {
				// resolve symlinks
				if (item.kind === 'link') {
					const filePath = await getRealpath(item.filePath);
					if (filePath != null && this.withinRoot(filePath)) {
						const kind = await getKind(filePath);
						item.target = { filePath, kind };
					}
				}
				return item;
			}),
		);
	}

	async #locateAltFiles(filePaths: string[]): Promise<FSLocation | void> {
		for (const filePath of filePaths) {
			if (!this.withinRoot(filePath)) continue;
			const kind = await getKind(filePath);
			if (kind === 'file' || kind === 'link') {
				return { filePath, kind };
			}
		}
	}

	/**
	Locate a file or alternative files that can be served for a resource,
	using the config for extensions and index file lookup.
	*/
	async locateFile(filePath: string): Promise<FSLocation> {
		if (!this.withinRoot(filePath)) {
			return { filePath, kind: null };
		}

		const kind = await getKind(filePath);

		// Try alternates
		if (kind === 'dir' && this.#index.length) {
			const paths = this.#index.map((name) => join(filePath, name));
			const match = await this.#locateAltFiles(paths);
			if (match) return match;
		} else if (kind === null && this.#ext.length) {
			const paths = this.#ext.map((ext) => filePath + ext);
			const match = await this.#locateAltFiles(paths);
			if (match) return match;
		}

		return { filePath, kind };
	}

	resolvePath(localPath: string): string | null {
		const filePath = join(this.#root, localPath);
		return this.withinRoot(filePath) ? trimSlash(filePath, { end: true }) : null;
	}

	withinRoot(filePath: string): boolean {
		return isSubpath(this.#root, filePath);
	}
}
