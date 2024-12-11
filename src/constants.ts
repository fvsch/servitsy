import type { RuntimeOptions } from './types.d.ts';

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
	host: undefined,
	ports: [8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089],
	gzip: true,
	cors: false,
	headers: [],
	dirList: true,
	index: ['index.html'],
	ext: ['.html'],
	exclude: ['.*', '!.well-known'],
};

export const CLI_OPTIONS: Record<string, string> = {
	'--help': `Display this help message`,
	'--version': `Display the current version of servitsy`,
	'-h, --host': `Specify custom host\n(default: undefined)`,
	'-p, --port': `Specify custom port(s)\n(default: '${PORTS_CONFIG.initial}+')`,
	'--cors': `Send CORS HTTP headers`,
	'--exclude': `Deny file access by pattern\n(default: '${DEFAULT_OPTIONS.exclude.join(', ')}')`,
	'--ext': `Extension(s) used to resolve URLs\n(default: '${DEFAULT_OPTIONS.ext}')`,
	'--header': `Add custom HTTP header(s) to responses`,
	'--index': `Directory index file(s)\n(default: '${DEFAULT_OPTIONS.index}')`,
	'--no-dirlist': `Do not serve directory listings`,
	'--no-exclude': `Disable default file access patterns`,
	'--no-ext': `Disable default file extensions`,
	'--no-gzip': `Disable gzip compression of text responses`,
	'--no-index': `Do not serve directory index files`,
};
