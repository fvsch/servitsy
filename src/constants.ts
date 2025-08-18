import type { RuntimeOptions, TrailingSlash } from './types.d.ts';
import { getRuntime, intRange } from './utils.ts';

export const HOSTS = {
	local: ['localhost', '127.0.0.1', '::1'],
	unspecified: ['0.0.0.0', '::'],
};

export const PORTS_CONFIG = {
	initial: 8080,
	count: 10,
	maxCount: 100,
};

export const SUPPORTED_METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST'];

export const MAX_COMPRESS_SIZE = 50_000_000;

export const DEFAULT_OPTIONS: Omit<RuntimeOptions, 'root'> = {
	cors: false,
	exclude: ['.*', '!.well-known'],
	ext: ['.html'],
	gzip: true,
	headers: [],
	host: getRuntime() === 'webcontainer' ? 'localhost' : undefined,
	index: ['index.html'],
	list: true,
	ports: intRange(8080, 8089),
	trailingSlash: 'auto',
};

export const CLI_OPTIONS: Record<string, string> = {
	'--help': `Display this help message`,
	'--version': `Display the current version of servitsy`,
	'-h, --host': `Specify custom host\n(default: undefined)`,
	'-p, --port': `Specify custom port(s)\n(default: '${PORTS_CONFIG.initial}+')`,
	'--cors': `Send CORS HTTP headers`,
	'--exclude': `Deny file access by pattern\n(default: '${DEFAULT_OPTIONS.exclude.join(', ')}')`,
	'--ext': `Set extension(s) used to resolve URLs\n(default: '${DEFAULT_OPTIONS.ext}')`,
	'--header': `Add custom HTTP header(s) to responses`,
	'--index': `Set directory index file name(s)\n(default: '${DEFAULT_OPTIONS.index}')`,
	'--trailing-slash': `Enforce trailing slash in URL path\n('auto' (default) | 'never' | 'always' | 'ignore')`,
	'--no-exclude': `Disable default file access patterns`,
	'--no-ext': `Disable default file extensions`,
	'--no-gzip': `Disable gzip compression of text responses`,
	'--no-index': `Do not serve index files`,
	'--no-list': `Do not serve directory listings`,
};
