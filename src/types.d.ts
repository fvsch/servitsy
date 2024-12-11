export type Request = import('node:http').IncomingMessage & { originalUrl?: string };
export type Response = import('node:http').ServerResponse<Request>;

export type FSKind = 'dir' | 'file' | 'link' | null;

export interface FSLocation {
	filePath: string;
	kind: FSKind;
	target?: { filePath: string; kind: FSKind };
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

export interface ServerOptions {
	root: string;
	ext?: string[];
	index?: string[];
	dirList?: boolean;
	exclude?: string[];
	host?: string;
	ports?: number[];
	headers?: HttpHeaderRule[];
	cors?: boolean;
	gzip?: boolean;
}

export interface RuntimeOptions {
	root: string;
	ext: string[];
	index: string[];
	dirList: boolean;
	exclude: string[];
	host: string | undefined;
	ports: number[];
	headers: HttpHeaderRule[];
	cors: boolean;
	gzip: boolean;
	_noStream?: boolean;
}
