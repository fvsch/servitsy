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
	dirFile: ['index.html'],
	ext: ['.html'],
	exclude: ['.*', '!.well-known'],
};

export const CLI_OPTIONS: Array<{ name: string; short?: string; help: string }> = [
	{
		name: 'help',
		help: 'Display this message',
	},
	{
		name: 'version',
		help: `Display current version`,
	},
	{
		name: 'host',
		short: 'h',
		help: `Bind to a specific host\n(default: undefined)`,
	},
	{
		name: 'port',
		short: 'p',
		help: `Bind to a specific port or ports\n(default: '${PORTS_CONFIG.initial}+')`,
	},
	{
		name: 'header',
		help: 'Add custom HTTP header(s) to responses',
	},
	{
		name: 'cors',
		help: `Send CORS HTTP headers in responses\n(default: false)`,
	},
	{
		name: 'gzip',
		help: `Use gzip compression for text files\n(default: true)`,
	},
	{
		name: 'ext',
		help: `Extensions which can be omitted in URLs\n(default: '${DEFAULT_OPTIONS.ext.join(', ')}')`,
	},
	{
		name: 'dirfile',
		help: `Directory index file(s)\n(default: '${DEFAULT_OPTIONS.dirFile.join(', ')}')`,
	},
	{
		name: 'dirlist',
		help: `Allow listing directory contents\n(default: true)`,
	},
	{
		name: 'exclude',
		help: `Block access to folders and files by pattern\n(default: '${DEFAULT_OPTIONS.exclude.join(', ')}')`,
	},
];
