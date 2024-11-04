export type DirIndexItem = FSEntryBase & {
	isParent?: boolean;
	target?: FSEntryBase;
};

export interface ErrorList {
	(msg: string): void;
	list: string[];
}

export type FSEntryKind = 'dir' | 'file' | 'link';

export interface FSEntryBase {
	filePath: string;
	kind: FSEntryKind | null;
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

export type OptionSpecs = Record<
	| 'cors'
	| 'dirFile'
	| 'dirList'
	| 'exclude'
	| 'ext'
	| 'gzip'
	| 'header'
	| 'help'
	| 'host'
	| 'port'
	| 'version',
	OptionSpec
>;

export interface PortsConfig {
	initial: number;
	count: number;
	maxCount: number;
}

export interface ResolveResult {
	status: number;
	urlPath: string;
	filePath: string | null;
	kind: FSEntryKind | null;
}

export type ReqResMeta = {
	method: string;
	status: number;
	url: string;
	urlPath: string;
	localPath: string | null;
	startedAt: number;
	endedAt?: number;
	error?: Error | string;
};

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
