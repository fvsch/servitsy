export type DirIndexItem = ResolvedFile & {
	isParent?: boolean;
	target?: ResolvedFile;
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
	file: ResolvedFile | null;
}

export type ReqResMeta = ResolveResult & {
	readonly startedAt: number;
	endedAt?: number;
	readonly method: string;
	readonly url: string;
	error?: Error | string;
};

export interface ResolvedFile {
	kind: FSEntryKind;
	filePath: string;
	localPath: string | null;
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
