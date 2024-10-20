/**
@typedef {import('./types.d.ts').OptionName} OptionName
@typedef {import('./types.d.ts').OptionSpec} OptionSpec
@typedef {import('./types.d.ts').ServerOptions} ServerOptions
@typedef {import('./types.d.ts').PortsConfig} PortsConfig
**/

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

/**
 * @type {Omit<ServerOptions, 'root'>}
 */
export const DEFAULT_OPTIONS = {
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

/**
 * @type {Omit<ServerOptions, 'root'>}
 */
export const MINIMAL_OPTIONS = {
	host: HOSTS_WILDCARD.v6,
	ports: [8080],
	gzip: false,
	cors: false,
	headers: [],
	dirList: false,
	dirFile: [],
	ext: [],
	exclude: [],
};

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
		default: DEFAULT_OPTIONS.dirFile,
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
		default: DEFAULT_OPTIONS.exclude,
	},
	ext: {
		help: 'Extensions which can be omitted in URLs',
		names: ['--ext'],
		negate: '--no-ext',
		default: DEFAULT_OPTIONS.ext,
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
		default: DEFAULT_OPTIONS.host,
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
