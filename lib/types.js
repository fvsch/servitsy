/**

@typedef {ResolvedFile & {isParent?: boolean; target?: ResolvedFile}} DirIndexItem

@typedef {{ error?: string; warn?: string }} ErrorMessage

@typedef {'dir' | 'file' | 'link'} FSEntryKind

@typedef {{ filePath: string; kind: FSEntryKind | null }} FSEntryBase

@typedef {{
	include?: string[];
	headers: Record<string, string>;
}} HttpHeaderRule

@typedef {{ host: string; ports: number[] }} ListenOptions

@typedef {'cors' | 'dirFile' | 'dirList' | 'exclude' | 'ext' | 'gzip' | 'header' | 'help' | 'host' | 'port' | 'version'} OptionName

@typedef {{ args: string[]; help: string; argDefault?: string }} OptionSpec

@typedef {{
	initial: number;
	count: number;
	countLimit: number;
}} PortsConfig

@typedef {{
	readonly startedAt: number;
	endedAt?: number;
	readonly method: string;
	readonly url: string;
	error?: Error | string;
} & ResolveResult} ReqResMeta

@typedef {{
	kind: FSEntryKind;
	filePath: string;
	localPath: string | null;
}} ResolvedFile

@typedef {{
	status: number;
	urlPath: string;
	file: ResolvedFile | null;
}} ResolveResult

@typedef {{
	root: string;
	ext: string[];
	dirFile: string[];
	dirList: boolean,
	exclude: string[];
	headers: HttpHeaderRule[];
	cors: boolean;
	gzip: boolean;
}} ServerOptions

**/
