import { homedir, networkInterfaces } from 'node:os';
import { sep as dirSep } from 'node:path';
import process, { argv, exit, platform, stdin } from 'node:process';
import { emitKeypressEvents } from 'node:readline';

import { CLIArgs, parseArgs } from './args.js';
import { CLI_OPTIONS, HOSTS_LOCAL, HOSTS_WILDCARD } from './constants.js';
import { checkDirAccess, pkgFilePath, readPkgJson } from './fs-utils.js';
import { color, logger, requestLogLine } from './logger.js';
import { serverOptions } from './options.js';
import { staticServer } from './server.js';
import { clamp, errorList, getRuntime, isPrivateIPv4 } from './utils.js';

/**
@typedef {import('./types.d.ts').OptionSpec} OptionSpec
@typedef {import('./types.d.ts').ServerOptions} ServerOptions
*/

/**
Start servitsy with configuration from command line arguments.
*/
export async function run() {
	const args = new CLIArgs(argv.slice(2));

	if (args.has('--version')) {
		const pkg = await readPkgJson();
		logger.write('info', pkg.version);
		process.exitCode = 0;
		return;
	} else if (args.has('--help')) {
		logger.write('info', `\n${helpPage()}\n`);
		process.exitCode = 0;
		return;
	}

	const error = errorList();
	const userOptions = parseArgs(args, { error });
	const options = serverOptions({ root: '', ...userOptions }, { error });

	await checkDirAccess(options.root, { error });
	// check access to assets needed by server pages,
	// to trigger a permission prompt before the server starts
	if (getRuntime() === 'deno') {
		await checkDirAccess(pkgFilePath('lib/assets'));
	}

	if (error.list.length) {
		logger.error(...error.list);
		logger.error(`Try 'servitsy --help' for more information.`);
		process.exitCode = 1;
		return;
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

	/** @type {import('node:os').NetworkInterfaceInfo | undefined} */
	#localNetworkInfo;

	/** @type {import('node:http').Server} */
	#server;

	/** @param {ServerOptions} options */
	constructor(options) {
		this.#options = options;
		this.#portIterator = new Set(options.ports).values();
		this.#localNetworkInfo = Object.values(networkInterfaces())
			.flat()
			.find((c) => c?.family === 'IPv4' && isPrivateIPv4(c?.address));

		this.#server = staticServer(options, {
			logNetwork: (info) => {
				logger.write('request', requestLogLine(info));
			},
		});
		this.#server.on('error', (error) => this.#onServerError(error));
		this.#server.on('listening', () => {
			const info = this.headerInfo();
			if (info) logger.write('header', info, { top: 1, bottom: 1 });
		});
	}

	start() {
		this.handleSignals();
		this.#server.listen(
			{
				host: this.#options.host,
				port: this.#portIterator.next().value,
			},
			// Wait until the server started listening — and hopefully all Deno
			// permission requests are done — before we can take over stdin inputs.
			() => {
				this.handleKeyboardInput();
			},
		);
	}

	headerInfo() {
		const { host, root } = this.#options;
		const address = this.#server.address();
		if (address !== null && typeof address === 'object') {
			const { local, network } = displayHosts({
				configuredHost: host,
				currentHost: address.address,
				networkAddress: this.#localNetworkInfo?.address,
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
				const header = color.style(first.padStart(hLength), 'bold');
				const value = color.style(second, second.startsWith('http') ? 'underline' : '');
				return `  ${header}  ${value}`;
			});
			return lines.join('\n');
		}
	}

	handleKeyboardInput() {
		if (!stdin.isTTY) return;
		let helpShown = false;
		emitKeypressEvents(stdin);
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
		stdin.setRawMode(true);
	}

	handleSignals() {
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

	/** @type {(error: NodeJS.ErrnoException & {hostname?: string}) => void} */
	#onServerError(error) {
		// Try restarting with the next port
		if (error.code === 'EADDRINUSE') {
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
					const msg = `${ports.length > 1 ? 'ports' : 'port'} already in use: ${ports.join(', ')}`;
					logger.error(msg);
					exit(1);
				}
			});
			return;
		}

		// Handle other errors
		if (error.code === 'ENOTFOUND') {
			logger.error(`host not found: '${error.hostname}'`);
		} else {
			logger.error(error);
		}
		exit(1);
	}
}

export function helpPage() {
	const spaces = (count = 0) => ' '.repeat(count);
	const indent = spaces(2);

	/** @type {Array<keyof CLI_OPTIONS>} */
	const optionsOrder = [
		'help',
		'version',
		'host',
		'port',
		'header',
		'cors',
		'gzip',
		'ext',
		'dirFile',
		'dirList',
		'exclude',
	];
	const options = optionsOrder.map((key) => CLI_OPTIONS[key]);

	/** @type {(heading?: string, lines?: string[]) => string} */
	const section = (heading = '', lines = []) => {
		const result = [];
		if (heading.length) result.push(indent + color.style(heading, 'bold'));
		if (lines.length) result.push(lines.map((l) => indent.repeat(2) + l).join('\n'));
		return result.join('\n\n');
	};

	/** @type {(options: OptionSpec[], config: {gap: string, firstWidth: number}) => string[]} */
	const optionCols = (options, { gap, firstWidth }) =>
		options.flatMap(({ help, names, default: argDefault = '' }) => {
			const header = names.join(', ').padEnd(firstWidth);
			const first = `${header}${gap}${help}`;
			if (!argDefault) return [first];
			const secondRaw = `(default: '${Array.isArray(argDefault) ? argDefault.join(', ') : argDefault}')`;
			const second = color.style(secondRaw, 'gray');
			if (first.length + secondRaw.length < 80) {
				return [`${first} ${second}`];
			} else {
				return [first, spaces(header.length + gap.length) + second];
			}
		});

	return [
		section(
			`${color.style('servitsy', 'magentaBright bold')} — Local HTTP server for static files`,
		),
		section('USAGE', [
			`${color.style('$', 'bold dim')} ${color.style('servitsy', 'magentaBright')} --help`,
			`${color.style('$', 'bold dim')} ${color.style('servitsy', 'magentaBright')} ${color.brackets('directory')} ${color.brackets('options')}`,
		]),
		section(
			'OPTIONS',
			optionCols(options, {
				gap: spaces(4),
				firstWidth: clamp(Math.max(...options.map((opt) => opt.names.join(', ').length)), 14, 20),
			}),
		),
	].join('\n\n');
}

/**
@param {{ configuredHost: string; currentHost: string; networkAddress?: string }} address
@returns {{ local: string; network?: string }}
*/
function displayHosts({ configuredHost, currentHost, networkAddress }) {
	const isLocalhost = (value = '') => HOSTS_LOCAL.includes(value);
	const isWildcard = (value = '') => HOSTS_WILDCARD.v4 === value || HOSTS_WILDCARD.v6 === value;

	if (!isWildcard(configuredHost) && !isLocalhost(configuredHost)) {
		return { local: configuredHost };
	}

	return {
		local: isWildcard(currentHost) || isLocalhost(currentHost) ? 'localhost' : currentHost,
		network:
			isWildcard(configuredHost) && getRuntime() !== 'webcontainer' ? networkAddress : undefined,
	};
}

/**
Replace the home dir with '~' in path
@type {(root: string) => string}
*/
function displayRoot(root) {
	if (
		// skip: not a common windows convention
		platform !== 'win32' &&
		// skip: requires --allow-sys=homedir in Deno
		getRuntime() !== 'deno'
	) {
		const prefix = homedir() + dirSep;
		if (root.startsWith(prefix)) {
			return root.replace(prefix, '~' + dirSep);
		}
	}
	return root;
}
