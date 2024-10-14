/**
@typedef {import('./types.js').OptionName} OptionName
@typedef {import('./types.js').OptionSpec} OptionSpec
@typedef {import('./types.js').PortsConfig} PortsConfig
**/

/** @type {string[]} */
export const EXTENSIONS_DEFAULT = ['.html'];

/** @type {string[]} */
export const DIR_FILE_DEFAULT = ['index.html'];

/** @type {string[]} */
export const FILE_EXCLUDE_DEFAULT = ['.*', '!.well-known'];

/** @type {string[]} */
export const HOSTS_LOCAL = ['localhost', '127.0.0.1', '::1'];

/** @type {{ v4: string; v6: string }} */
export const HOSTS_WILDCARD = { v4: '0.0.0.0', v6: '::' };

/** @type {PortsConfig} */
export const PORTS_CONFIG = {
	initial: 8080,
	count: 10,
	maxCount: 100,
};

/** @type {string[]} */
export const SUPPORTED_METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST'];

export const MAX_COMPRESS_SIZE = 50_000_000;

/** @type {Record<OptionName, OptionSpec>} */
export const CLI_OPTIONS = {
	cors: {
		help: 'Send CORS HTTP headers in responses',
		names: ['--cors'],
		negate: '--no-cors',
		default: 'false',
	},
	dirFile: {
		help: 'Directory index file(s)',
		names: ['--dir-file'],
		negate: '--no-dir-file',
		default: DIR_FILE_DEFAULT,
	},
	dirList: {
		help: 'Allow listing directory contents',
		names: ['--dir-list'],
		negate: '--no-dir-list',
		default: 'true',
	},
	exclude: {
		help: 'Block access to folders and files by pattern',
		names: ['--exclude'],
		negate: '--no-exclude',
		default: FILE_EXCLUDE_DEFAULT,
	},
	ext: {
		help: 'Extensions which can be omitted in URLs',
		names: ['--ext'],
		negate: '--no-ext',
		default: EXTENSIONS_DEFAULT,
	},
	gzip: {
		help: 'Use gzip compression for text files',
		names: ['--gzip'],
		negate: '--no-gzip',
		default: 'true',
	},
	header: {
		help: 'Add custom HTTP header(s) to responses',
		names: ['--header'],
	},
	help: {
		help: 'Display this message',
		names: ['--help'],
	},
	host: {
		help: 'Bind to a specific host',
		names: ['-h', '--host'],
		default: HOSTS_WILDCARD.v4,
	},
	port: {
		help: 'Bind to a specific port or ports',
		names: ['-p', '--port'],
		default: `${PORTS_CONFIG.initial}+`,
	},
	version: {
		help: `Display current version`,
		names: ['--version'],
	},
};
