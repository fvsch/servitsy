import type { ServerOptions } from './types.d.ts';

export const HOSTS_LOCAL = ['localhost', '127.0.0.1', '::1'];

export const HOSTS_WILDCARD = {
	v4: '0.0.0.0',
	v6: '::',
};

export const PORTS_CONFIG = {
	initial: 8080,
	count: 10,
	maxCount: 100,
};

export const SUPPORTED_METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST'];

export const MAX_COMPRESS_SIZE = 50_000_000;

export const DEFAULT_OPTIONS: Omit<Required<ServerOptions>, 'root'> = {
	host: HOSTS_WILDCARD.v6,
	ports: [8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089],
	gzip: true,
	cors: false,
	headers: [],
	dirList: true,
	dirFile: ['index.html'],
	ext: ['.html'],
	exclude: ['.*', '!.well-known'],
};

interface CLIOption {
	name: string;
	short?: string;
	help: string;
	initial?: boolean | string | string[];
}

export const CLI_OPTIONS: CLIOption[] = [
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
		help: 'Bind to a specific host',
		initial: DEFAULT_OPTIONS.host,
	},
	{
		name: 'port',
		short: 'p',
		help: 'Bind to a specific port or ports',
		initial: `${PORTS_CONFIG.initial}+`,
	},
	{
		name: 'header',
		help: 'Add custom HTTP header(s) to responses',
	},
	{
		name: 'cors',
		help: 'Send CORS HTTP headers in responses',
		initial: 'false',
	},
	{
		name: 'gzip',
		help: 'Use gzip compression for text files',
		initial: true,
	},
	{
		name: 'ext',
		help: 'Extensions which can be omitted in URLs',
		initial: DEFAULT_OPTIONS.ext,
	},
	{
		name: 'dir-file',
		help: 'Directory index file(s)',
		initial: DEFAULT_OPTIONS.dirFile,
	},
	{
		name: 'dir-list',
		help: 'Allow listing directory contents',
		initial: true,
	},
	{
		name: 'exclude',
		help: 'Block access to folders and files by pattern',
		initial: DEFAULT_OPTIONS.exclude,
	},
];
