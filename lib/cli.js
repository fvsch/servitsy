import { homedir, networkInterfaces } from 'node:os';
import { sep } from 'node:path';
import process from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { inspect } from 'node:util';

import { CLIArgs } from './args.js';
import { CLI_OPTIONS, HOSTS_LOCAL, HOSTS_WILDCARD } from './constants.js';
import { logger } from './logger.js';
import { readPkgJson } from './node-fs.js';
import { serverOptions } from './options.js';
import { staticServer } from './server.js';
import { clamp } from './utils.js';

/**
 * Run servitsy with configuration from command line arguments.
 */
export async function run() {
	const args = new CLIArgs(process.argv.slice(2));

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
	/** @type {import('./types.js').ServerOptions} */
	#options;

	/** @type {number | undefined} */
	#port;

	/** @type {IterableIterator<number>} */
	#portIterator;

	/** @type {import('node:http').Server} */
	#server;

	/**
	 * @param {import('./types.js').ServerOptions} options
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
				data.push(['network', `http://${network}:${address.port}`]);
			}
			const hLength = Math.max(...data.map((r) => r[0].length));
			const lines = data.map((r) => `  ${r[0].padStart(hLength)}  ${r[1]}`);
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
					process.exit(1);
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
		process.exit(1);
	}

	#handleKeyboardInput() {
		if (!process.stdin.isTTY) return;
		let helpShown = false;
		emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true);
		process.stdin.on('keypress', (_str, key) => {
			if (
				// control+c
				key.sequence === '\x03' ||
				// escape
				key.sequence === '\x1B'
			) {
				process.exit();
			}
			// Result of console.clear is kinda unpredictable and can look bad.
			// Might require refactoring with use of process.stdout exclusively?
			// else if (key.sequence === '\f') {
			//	console.clear();
			//	console.log(`\n${listeningInfo()}\n`);
			// }
			else if (!helpShown) {
				helpShown = true;
				logger.write('info', 'Hit Control+C or Escape to stop the server.', { top: 1, bottom: 1 });
			}
		});
	}

	#handleSignals() {
		let shuttingDown = false;

		const shutdownListener = () => {
			if (shuttingDown) return;
			shuttingDown = true;
			console.log('\nGracefully shutting down...');
			this.#server.closeAllConnections();
			this.#server.close();
			process.exit(0);
		};

		process.on('SIGBREAK', shutdownListener);
		process.on('SIGINT', shutdownListener);
		process.on('SIGTERM', shutdownListener);
	}
}

export function helpPage() {
	const indent = '  ';
	/** @type {(heading?: string, lines?: string[]) => string} */
	const section = (heading = '', lines = []) => {
		const result = [];
		if (heading.length) result.push(indent + heading);
		if (lines.length) result.push(lines.map((l) => indent.repeat(2) + l).join('\n'));
		return result.join('\n\n');
	};

	/** @type {(opts: { items: string[][], gap: string, firstWidth: number}) => string[]} */
	const twoCols = ({ items, gap, firstWidth }) =>
		items.flatMap(([first, second]) => {
			const header = first.padEnd(firstWidth);
			return second.split('\n').map((part, index) => {
				if (index === 0) return `${header}${gap}${part}`;
				return `${' '.repeat(header.length)}${gap}${part}`;
			});
		});

	const optionRows = Object.values(CLI_OPTIONS).map((opt) => [opt.args.join(', '), opt.help]);
	const firstWidth = Math.max(...optionRows.map((row) => row[0].length));

	return [
		section(`servitsy - Start a HTTP server for a directory of static files`),
		section('USAGE', [`$ servitsy --help`, `$ servitsy [directory] [options]`]),
		section(
			'OPTIONS',
			twoCols({
				gap: ' '.repeat(4),
				firstWidth: clamp(firstWidth, 14, 20),
				items: optionRows,
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

	const networkAddress = () => {
		const configs = Object.values(networkInterfaces()).flat();
		return configs.find((c) => c && c.family === 'IPv4' && c.address.startsWith('192.168.'))
			?.address;
	};

	if (!isWildcard(configuredHost) && !isLocalhost(configuredHost)) {
		return { local: configuredHost };
	}

	return {
		local: isWildcard(currentHost) || isLocalhost(currentHost) ? 'localhost' : currentHost,
		network: isWildcard(configuredHost) ? networkAddress() : undefined,
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
