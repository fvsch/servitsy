/**
@typedef {import('./types.js').OptionName} OptionName
@typedef {import('./types.js').OptionSpec} OptionSpec
@typedef {import('./types.js').PortsConfig} PortsConfig
**/

/** @type {readonly string[]} */
export const EXTENSIONS_DEFAULT = Object.freeze(['.html']);

/** @type {readonly string[]} */
export const DIR_FILE_DEFAULT = Object.freeze(['index.html']);

/** @type {readonly string[]} */
export const FILE_EXCLUDE_DEFAULT = Object.freeze(['.*', '!.well-known']);

/** @type {readonly string[]} */
export const HOSTS_LOCAL = Object.freeze(['localhost', '127.0.0.1', '::1']);

/** @type {{ v4: string; v6: string }} */
export const HOSTS_WILDCARD = Object.freeze({
	v4: '0.0.0.0',
	v6: '::',
});

/** @type {PortsConfig} */
export const PORTS_CONFIG = Object.freeze({
	initial: 8080,
	count: 10,
	countLimit: 100,
});

/** @type {string[]} */
export const SUPPORTED_METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST'];

/** @type {Record<OptionName, OptionSpec>} */
export const CLI_OPTIONS = Object.freeze({
	cors: {
		args: ['--cors'],
		argDefault: 'false',
		help: 'Send CORS HTTP headers in responses',
	},
	dirFile: {
		args: ['--dir-file'],
		argDefault: DIR_FILE_DEFAULT.join(', '),
		help: 'Directory index file(s)',
	},
	dirList: {
		args: ['--dir-list'],
		argDefault: 'true',
		help: 'Allow listing directory contents',
	},
	exclude: {
		args: ['--exclude'],
		argDefault: FILE_EXCLUDE_DEFAULT.join(', '),
		help: 'Block access to folders and files by pattern',
	},
	ext: {
		args: ['--ext'],
		argDefault: EXTENSIONS_DEFAULT.join(', '),
		help: 'Extensions which can be omitted in URLs',
	},
	header: {
		args: ['--header'],
		help: 'Add custom HTTP header(s) to responses',
	},
	help: {
		args: ['--help'],
		help: 'Display this message',
	},
	host: {
		args: ['-h', '--host'],
		argDefault: `${HOSTS_WILDCARD.v4}`,
		help: 'Bind to a specific host',
	},
	port: {
		args: ['-p', '--port'],
		argDefault: `${PORTS_CONFIG.initial}+`,
		help: 'Bind to a specific port or ports',
	},
	version: {
		args: ['--version'],
		help: `Display current version`,
	},
});
