import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { homedir, networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { sep as dirSep } from 'node:path';
import process, { argv, exit, platform, stdin } from 'node:process';
import { emitKeypressEvents } from 'node:readline';

import { CLIArgs } from './args.ts';
import { CLI_OPTIONS, HOSTS } from './constants.ts';
import { checkDirAccess } from './fs-utils.ts';
import { RequestHandler } from './handler.ts';
import { color, Logger, requestLogLine } from './logger.ts';
import { serverOptions } from './options.ts';
import { FileResolver } from './resolver.ts';
import type { RuntimeOptions } from './types.d.ts';
import { clamp, errorList, getRuntime, isPrivateIPv4 } from './utils.ts';

/**
Start servitsy with configuration from command line arguments.
*/
export async function run() {
	const logger = new Logger(process.stdout, process.stderr);
	const args = new CLIArgs(argv.slice(2));

	if (args.bool('version')) {
		const pkg = readPkgJson();
		logger.write('info', pkg.version);
		process.exitCode = 0;
		return;
	} else if (args.bool('help')) {
		logger.write('info', `\n${helpPage()}\n`);
		process.exitCode = 0;
		return;
	}

	const onError = errorList();
	const userOptions = { root: '', ...args.options(onError) };
	const options = serverOptions(userOptions, onError);
	await checkDirAccess(options.root, onError);

	if (onError.list.length) {
		logger.error(...onError.list);
		logger.error(`Try 'servitsy --help' for more information.`);
		process.exitCode = 1;
		return;
	}

	const cliServer = new CLIServer(options, logger);
	cliServer.start();
}

export class CLIServer {
	#options: RuntimeOptions;
	#port?: number;
	#portIterator: IterableIterator<number>;
	#localNetworkInfo?: NetworkInterfaceInfo;
	#server: Server;
	#logger: Logger;

	constructor(options: RuntimeOptions, logger: Logger) {
		this.#logger = logger;
		this.#options = options;
		this.#portIterator = new Set(options.ports).values();
		this.#localNetworkInfo = Object.values(networkInterfaces())
			.flat()
			.find((c) => c?.family === 'IPv4' && isPrivateIPv4(c?.address));

		const resolver = new FileResolver(options);
		const server = createServer(async (req, res) => {
			const handler = new RequestHandler({ req, res, resolver, options });
			res.on('close', () => {
				this.#logger.write('request', requestLogLine(handler.data()));
			});
			await handler.process();
		});
		server.on('error', (error) => this.onError(error));
		server.on('listening', () => {
			const info = this.headerInfo();
			if (info) {
				this.#logger.write('header', info, { top: 1, bottom: 1 });
			}
		});

		this.#server = server;
	}

	nextPort() {
		this.#port = this.#portIterator.next().value;
		return this.#port;
	}

	start() {
		const port = this.nextPort();
		if (!port) throw new Error('Port not specified');

		this.handleSignals();
		this.#server.listen(
			{ host: this.#options.host, port },
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
				this.#logger.write('info', 'Hit Control+C or Escape to stop the server.');
			}
		});
		stdin.setRawMode(true);
	}

	#attached = false;
	handleSignals() {
		if (this.#attached) return;
		process.on('SIGBREAK', this.shutdown);
		process.on('SIGINT', this.shutdown);
		process.on('SIGTERM', this.shutdown);
		this.#attached = true;
	}

	#shuttingDown = false;
	shutdown = async () => {
		if (this.#shuttingDown) return;
		this.#shuttingDown = true;

		process.exitCode = 0;
		const promise = this.#logger.write('info', 'Gracefully shutting down...');
		this.#server.closeAllConnections();
		this.#server.close();
		await promise;

		exit();
	};

	onError(error: NodeJS.ErrnoException & { hostname?: string }) {
		// Try restarting with the next port
		if (error.code === 'EADDRINUSE') {
			this.#server.closeAllConnections();
			this.#server.close(() => {
				const port = this.nextPort();
				if (port) {
					this.#server.listen({ host: this.#options.host, port });
				} else {
					const { ports } = this.#options;
					const msg = `${ports.length > 1 ? 'ports' : 'port'} already in use: ${ports.join(', ')}`;
					this.#logger.error(msg);
					exit(1);
				}
			});
			return;
		}

		// Handle other errors
		if (error.code === 'ENOTFOUND') {
			this.#logger.error(`host not found: '${error.hostname}'`);
		} else {
			this.#logger.error(error);
		}
		exit(1);
	}
}

export function helpPage() {
	const spaces = (count = 0) => ' '.repeat(count);
	const indent = spaces(2);
	const colGap = spaces(4);

	const section = (heading: string = '', lines: string[] = []) => {
		const result = [];
		if (heading.length) result.push(indent + color.style(heading, 'bold'));
		if (lines.length) result.push(lines.map((l) => indent.repeat(2) + l).join('\n'));
		return result.join('\n\n');
	};

	const optionCols = () => {
		const options = CLI_OPTIONS.map((opt) => {
			const title = opt.short ? `-${opt.short}, --${opt.name}` : `--${opt.name}`;
			const [help1, help2] = opt.help.split('\n');
			return { title, help1, help2 };
		});

		const col1Width = clamp(Math.max(...options.map((opt) => opt.title.length)), 14, 20);

		return options.flatMap(({ title, help1, help2 }) => {
			const col1 = title.padEnd(col1Width) + colGap;
			const line1 = `${col1}${help1}`;
			if (!help2) return [line1];
			return line1.length + help2.length < 80
				? [`${line1} ${color.style(help2, 'gray')}`]
				: [line1, spaces(col1.length) + color.style(help2, 'gray')];
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
	configured?: string;
	actual: string;
	networkAddress?: string;
}): { local: string; network?: string } {
	const isLocal = (value: string) => HOSTS.local.includes(value);
	const isUnspec = (value: string) => HOSTS.unspecified.includes(value);

	if (configured && !isUnspec(configured) && !isLocal(configured)) {
		return { local: configured };
	}

	const local = isUnspec(actual) || isLocal(actual) ? 'localhost' : actual;
	const showNetwork = !configured || isUnspec(configured);
	return { local, network: showNetwork ? networkAddress : undefined };
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

function readPkgJson(): Record<string, any> {
	return createRequire(import.meta.url)('../package.json');
}
