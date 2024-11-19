import { RequestHandler } from './handler.ts';
import { serverOptions } from './options.ts';
import { FileResolver } from './resolver.ts';
import type { Request, Response, ServerOptions } from './types.d.ts';
import { errorList } from './utils.ts';

export function middleware(options: Partial<ServerOptions>) {
	if (!options || typeof options !== 'object') {
		options = {};
	}

	const onError = errorList();
	const fullOptions = serverOptions(
		{ root: typeof options.root === 'string' ? options.root : '', ...options },
		onError,
	);
	if (onError.list.length) {
		throw new OptionsError(onError.list);
	}

	const resolver = new FileResolver(fullOptions);

	return async function servitsyHandler(req: Request, res: Response, next: (value: any) => void) {
		const handler = new RequestHandler({ req, res, resolver, options: fullOptions });
		await handler.process();
		if (res.statusCode !== 200 && !res.headersSent && typeof next === 'function') {
			next(handler.data());
		}
	};
}

class OptionsError extends Error {
	list: string[];
	constructor(list: string[]) {
		const message = 'Invalid option(s):\n' + list.map((msg) => `    ${msg}`).join('\n');
		super(message);
		this.list = [...list];
	}
}
