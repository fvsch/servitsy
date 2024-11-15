import { createServer } from 'node:http';
import { homedir, networkInterfaces } from 'node:os';
import { sep as dirSep } from 'node:path';
import process, { argv, exit, platform, stdin } from 'node:process';
import { emitKeypressEvents } from 'node:readline';

import { CLIArgs, parseArgs } from './args.js';
import { CLI_OPTIONS, HOSTS_LOCAL, HOSTS_WILDCARD } from './constants.js';
import { checkDirAccess, readPkgJson } from './fs-utils.js';
import { RequestHandler } from './handler.js';
import { color, logger, requestLogLine } from './logger.js';
import { serverOptions } from './options.js';
import { FileResolver } from './resolver.js';
import type { OptionName, ServerOptions } from './types.d.ts';
import { clamp, errorList, getRuntime, isPrivateIPv4 } from './utils.js';

/**
Start servitsy with configuration from command line arguments.
*/
export async function run() {
	const args = new CLIArgs(argv.slice(2));

	if (args.has('--version')) {
		const pkg = readPkgJson();
		logger.write('info', pkg.version);
		process.exitCode = 0;
		return;
	} else if (args.has('--help')) {
		logger.write('info', `\n${helpPage()}\n`);
		process.exitCode = 0;
		return;
	}

	const onError = errorList();
	const userOptions = parseArgs(args, { onError });
	const options = serverOptions({ root: '', ...userOptions }, { onError });
	await checkDirAccess(options.root, { onError });

	if (onError.list.length) {
		logger.error(...onError.list);
		logger.error(`Try 'servitsy --help' for more information.`);
		process.exitCode = 1;
		return;
	}

	const cliServer = new CLIServer(options);
	cliServer.start();
}

export class CLIServer {
	#options: ServerOptions;
	#port: number | undefined;
	#portIterator: IterableIterator<number>;
	#localNetworkInfo: import('node:os').NetworkInterfaceInfo | undefined;
	#server: import('node:http').Server;
	#resolver: FileResolver;
	#shuttingDown = false;

	constructor(options: ServerOptions) {
		this.#options = options;
		this.#portIterator = new Set(options.ports).values();
		this.#localNetworkInfo = Object.values(networkInterfaces())
			.flat()
			.find((c) => c?.family === 'IPv4' && isPrivateIPv4(c?.address));

		const resolver = new FileResolver(options);
		const server = createServer(async (req, res) => {
			const handler = new RequestHandler({ req, res, resolver, options });
			res.on('close', () => {
				logger.write('request', requestLogLine(handler.data()));
			});
			await handler.process();
		});
		server.on('error', (error) => this.#onServerError(error));
		server.on('listening', () => {
			const info = this.headerInfo();
			if (info) logger.write('header', info, { top: 1, bottom: 1 });
		});

		this.#resolver = resolver;
		this.#server = server;
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
				configured: host,
				actual: address.address,
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

	#onServerError(error: NodeJS.ErrnoException & { hostname?: string }) {
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
	const colGap = spaces(4);

	const optionsOrder: OptionName[] = [
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

	const section = (heading: string = '', lines: string[] = []) => {
		const result = [];
		if (heading.length) result.push(indent + color.style(heading, 'bold'));
		if (lines.length) result.push(lines.map((l) => indent.repeat(2) + l).join('\n'));
		return result.join('\n\n');
	};

	const optionCols = () => {
		const hMaxLength = Math.max(...options.map((opt) => opt.names.join(', ').length));
		const firstWidth = clamp(hMaxLength, 14, 20);
		return options.flatMap(({ help, names, default: argDefault = '' }) => {
			const header = names.join(', ').padEnd(firstWidth);
			const first = `${header}${colGap}${help}`;
			if (!argDefault) return [first];
			const secondRaw = `(default: '${Array.isArray(argDefault) ? argDefault.join(', ') : argDefault}')`;
			const second = color.style(secondRaw, 'gray');
			if (first.length + secondRaw.length < 80) {
				return [`${first} ${second}`];
			} else {
				return [first, spaces(header.length + colGap.length) + second];
			}
		});
	};

	return [
		section(
			`${color.style('servitsy', 'magentaBright bold')} — Local HTTP server for static files`,
		),
		section('USAGE', [
			`${color.style('$', 'bold dim')} ${color.style('servitsy', 'magentaBright')} --help`,
			`${color.style('$', 'bold dim')} ${color.style('servitsy', 'magentaBright')} ${color.brackets('directory')} ${color.brackets('options')}`,
		]),
		section('OPTIONS', optionCols()),
	].join('\n\n');
}

function displayHosts({
	configured,
	actual,
	networkAddress,
}: {
	configured: string;
	actual: string;
	networkAddress?: string;
}): { local: string; network?: string } {
	const isLocalhost = (value = '') => HOSTS_LOCAL.includes(value);
	const isWildcard = (value = '') => HOSTS_WILDCARD.v4 === value || HOSTS_WILDCARD.v6 === value;

	if (!isWildcard(configured) && !isLocalhost(configured)) {
		return { local: configured };
	}

	return {
		local: isWildcard(actual) || isLocalhost(actual) ? 'localhost' : actual,
		network: isWildcard(configured) && getRuntime() !== 'webcontainer' ? networkAddress : undefined,
	};
}

/**
Replace the home dir with '~' in path
*/
function displayRoot(root: string): string {
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
