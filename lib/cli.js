import { homedir, networkInterfaces } from 'node:os';
import { sep } from 'node:path';
import { default as process, argv, env, exit, stdin } from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { inspect } from 'node:util';

import { CLIArgs } from './args.js';
import { brackets, style } from './color.js';
import { CLI_OPTIONS, HOSTS_LOCAL, HOSTS_WILDCARD } from './constants.js';
import { logger } from './logger.js';
import { readPkgJson } from './node-fs.js';
import { serverOptions } from './options.js';
import { staticServer } from './server.js';
import { clamp, isPrivateIPv4 } from './utils.js';

/**
@typedef {import('./constants.js').OptionName} OptionName
@typedef {import('./constants.js').OptionSpec} OptionSpec
@typedef {import('./types.js').ServerOptions} ServerOptions
**/

/**
 * Run servitsy with configuration from command line arguments.
 */
export async function run() {
	const args = new CLIArgs(argv.slice(2));

	if (args.has('--version')) {
		logger.write('info', readPkgJson().version);
		process.exitCode = 0;
		return;
	} else if (args.has('--help')) {
		logger.write('info', `\n${helpPage()}\n`);
		process.exitCode = 0;
		return;
	}

	const { errors, options } = serverOptions({}, args);

	if (errors.length) {
		logger.writeErrors(errors);
		logger.write('error', `Try 'servitsy --help' for more information.`);
		if (errors.some((err) => err.error)) {
			process.exitCode = 1;
			return;
		}
	}

	const cliServer = new CLIServer(options);
	cliServer.start();
}

export class CLIServer {
	/** @type {ServerOptions} */
	#options;

	/** @type {number | undefined} */
	#port;

	/** @type {IterableIterator<number>} */
	#portIterator;

	/** @type {import('node:http').Server} */
	#server;

	/**
	 * @param {ServerOptions} options
	 */
	constructor(options) {
		this.#options = options;
		this.#portIterator = new Set(options.ports).values();

		this.#server = staticServer(options, {
			logNetwork: (info) => logger.writeRequest(info),
		});
		this.#server.on('error', (error) => this.#handleServerError(error));
		this.#server.on('listening', () => {
			logger.write('header', this.#headerInfo(), { top: 1, bottom: 1 });
		});
	}

	start() {
		this.#handleSignals();
		this.#handleKeyboardInput();
		this.#server.listen({
			host: this.#options.host,
			port: this.#portIterator.next().value,
		});
	}

	#headerInfo() {
		const { host, root } = this.#options;
		const address = this.#server.address();
		if (address !== null && typeof address === 'object') {
			const { local, network } = displayHosts({
				configuredHost: host,
				currentHost: address.address,
			});
			const data = [
				['serving', displayRoot(root)],
				['local', `http://${local}:${address.port}`],
			];
			if (network) {
				data.push(['network', `http://${network}:${address.port}`, 'underline']);
			}
			const hLength = Math.max(...data.map((r) => r[0].length));
			const lines = data.map(([first, second]) => {
				const header = style(first.padStart(hLength), 'bold');
				const value = style(second, second.startsWith('http') ? 'underline' : '');
				return `  ${header}  ${value}`;
			});
			return lines.join('\n');
		}
	}

	/**
	 * @param {NodeJS.ErrnoException & {hostname?: string}} error
	 */
	#handleServerError(error) {
		// Try restarting with the next port
		if (error.syscall === 'listen' && error.code === 'EADDRINUSE') {
			const { value: nextPort } = this.#portIterator.next();
			const { ports } = this.#options;
			this.#server.closeAllConnections();
			this.#server.close(() => {
				if (nextPort) {
					this.#port = nextPort;
					this.#server.listen({
						host: this.#options.host,
						port: this.#port,
					});
				} else {
					logger.writeErrors({
						error: `${ports.length > 1 ? 'ports' : 'port'} already in use: ${ports.join(', ')}`,
					});
					exit(1);
				}
			});
			return;
		}

		// Handle other errors
		if (error.syscall === 'getaddrinfo' && error.code === 'ENOTFOUND') {
			logger.writeErrors({ error: `host not found: '${error.hostname}'` });
		} else {
			logger.write('error', inspect(error, { colors: true }));
		}
		exit(1);
	}

	#handleKeyboardInput() {
		if (!stdin.isTTY) return;
		let helpShown = false;
		emitKeypressEvents(stdin);
		stdin.setRawMode(true);
		stdin.on('keypress', (_str, key) => {
			if (
				// control+c
				key.sequence === '\x03' ||
				// escape
				key.sequence === '\x1B'
			) {
				this.shutdown();
			} else if (!helpShown) {
				helpShown = true;
				logger.write('info', 'Hit Control+C or Escape to stop the server.');
			}
		});
	}

	#handleSignals() {
		process.on('SIGBREAK', this.shutdown);
		process.on('SIGINT', this.shutdown);
		process.on('SIGTERM', this.shutdown);
	}

	#shuttingDown = false;
	shutdown = async () => {
		if (this.#shuttingDown) return;
		this.#shuttingDown = true;

		process.exitCode = 0;
		const promise = logger.write('info', 'Gracefully shutting down...');
		this.#server.closeAllConnections();
		this.#server.close();
		await promise;

		exit();
	};
}

export function helpPage() {
	const spaces = (count = 0) => ' '.repeat(count);
	const indent = spaces(2);

	/** @type {OptionName[]} */
	const optionsOrder = [
		'help',
		'version',
		'host',
		'port',
		'header',
		'cors',
		'ext',
		'dirFile',
		'dirList',
		'exclude',
	];
	const options = optionsOrder.map((key) => CLI_OPTIONS[key]);

	/** @type {(heading?: string, lines?: string[]) => string} */
	const section = (heading = '', lines = []) => {
		const result = [];
		if (heading.length) result.push(indent + style(heading, 'bold'));
		if (lines.length) result.push(lines.map((l) => indent.repeat(2) + l).join('\n'));
		return result.join('\n\n');
	};

	/** @type {(options: import('./constants.js').OptionSpec[], config: {gap: string, firstWidth: number}) => string[]} */
	const optionCols = (options, { gap, firstWidth }) =>
		options.flatMap(({ args, help, argDefault = '' }) => {
			const header = args.join(', ').padEnd(firstWidth);
			const first = `${header}${gap}${help}`;
			if (!argDefault) return [first];
			const second = `(default: '${argDefault}')`;
			const formattedSecond = style(`(default: '${argDefault}')`, 'gray');
			if (first.length + second.length < 80) {
				return [`${first} ${formattedSecond}`];
			} else {
				return [first, spaces(header.length + gap.length) + formattedSecond];
			}
		});

	return [
		section(`${style('servitsy', 'magentaBright bold')} — Local HTTP server for static files`),
		section('USAGE', [
			`${style('$', 'bold dim')} ${style('servitsy', 'magentaBright')} --help`,
			`${style('$', 'bold dim')} ${style('servitsy', 'magentaBright')} ${brackets('directory')} ${brackets('options')}`,
		]),
		section(
			'OPTIONS',
			optionCols(options, {
				gap: spaces(4),
				firstWidth: clamp(Math.max(...options.map((opt) => opt.args.join(', ').length)), 14, 20),
			}),
		),
	].join('\n\n');
}

/**
 * @param {{ configuredHost: string; currentHost: string }} address
 * @returns {{ local: string; network?: string }}
 */
function displayHosts({ configuredHost, currentHost }) {
	const isLocalhost = (value = '') => HOSTS_LOCAL.includes(value);
	const isWildcard = (value = '') => Object.values(HOSTS_WILDCARD).includes(value);
	const isWebcontainers = () => env['SHELL']?.endsWith('/jsh');

	const networkAddress = () => {
		const configs = Object.values(networkInterfaces()).flat();
		return configs.find((c) => c?.family === 'IPv4' && isPrivateIPv4(c?.address))?.address;
	};

	if (!isWildcard(configuredHost) && !isLocalhost(configuredHost)) {
		return { local: configuredHost };
	}

	return {
		local: isWildcard(currentHost) || isLocalhost(currentHost) ? 'localhost' : currentHost,
		network: isWildcard(configuredHost) && !isWebcontainers() ? networkAddress() : undefined,
	};
}

/**
 * @param {string} root
 * @returns {string}
 */
function displayRoot(root) {
	const prefix = homedir() + sep;
	if (root.startsWith(prefix)) {
		return root.replace(prefix, '~' + sep);
	}
	return root;
}
