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

export interface OptionSpec {
	help: string;
	names: string[];
	negate?: string;
	default?: string | string[];
}

export interface ResMetaData {
	method: string;
	status: number;
	urlPath: string;
	localPath: string | null;
	timing: { start: number; send?: number; close?: number };
	error?: Error | string;
}

export interface HttpOptions {
	host: string;
	ports: number[];
	headers: HttpHeaderRule[];
	cors: boolean;
	gzip: boolean;
}

export interface ResolveOptions {
	root: string;
	ext: string[];
	dirFile: string[];
	dirList: boolean;
	exclude: string[];
}

export type ServerOptions = HttpOptions & ResolveOptions;
