export type Request = import('node:http').IncomingMessage & { originalUrl?: string };
export type Response = import('node:http').ServerResponse<Request>;

export type FSKind = 'dir' | 'file' | 'link' | null;

export interface FSLocation {
	filePath: string;
	kind: FSKind;
	target?: {
		filePath: string;
		kind: FSKind;
	};
}

export interface HttpHeaderRule {
	include?: string[];
	headers: Record<string, string | number | boolean>;
}

export interface ResMetaData {
	method: string;
	status: number;
	url: string;
	urlPath: string | null;
	localPath: string | null;
	timing: { start: number; send?: number; close?: number };
	error?: Error | string;
}

export type TrailingSlash = 'auto' | 'never' | 'always' | 'ignore';

export interface ServerOptions {
	root: string;
	cors?: boolean;
	exclude?: string[];
	ext?: string[];
	gzip?: boolean;
	headers?: HttpHeaderRule[];
	host?: string;
	index?: string[];
	list?: boolean;
	ports?: number[];
	trailingSlash?: TrailingSlash;
}

export interface RuntimeOptions {
	root: string;
	cors: boolean;
	exclude: string[];
	ext: string[];
	gzip: boolean;
	headers: HttpHeaderRule[];
	host: string | undefined;
	index: string[];
	list: boolean;
	ports: number[];
	trailingSlash: TrailingSlash;
}
