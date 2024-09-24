/**

@typedef {'cors' | 'dirFile' | 'dirList' | 'exclude' | 'ext' | 'header' | 'help' | 'host' | 'port' | 'version'} OptionName
@typedef {{ args: string[]; help: string; argDefault?: string }} OptionSpec

@typedef {{
	initial: number;
	count: number;
	countLimit: number;
}} PortsConfig

@typedef {{ error?: string; warn?: string }} ErrorMessage

@typedef {'dir' | 'file' | 'link'} FSEntryKind
@typedef {{ filePath: string; kind: FSEntryKind | null }} FSEntryBase

@typedef {{
	dirSep: '/' | '\\';
	join(...paths: string[]): string;
	index(dirPath: string): Promise<FSEntryBase[]>;
	info(filePath: string): Promise<FSEntryBase & {readable: boolean}>;
	kind(filePath: string): Promise<FSEntryKind | null>;
	open(filePath: string): Promise<import('node:fs/promises').FileHandle>;
	readable(filePath: string, kind?: FSEntryKind | null): Promise<boolean>;
	readFile(filePath: string): Promise<import('node:buffer').Buffer | string>;
	realpath(filePath: string): Promise<string | null>;
}} FSProxy

@typedef {{
	include?: string[];
	headers: Record<string, string>;
}} HttpHeaderRule

@typedef {{
	root: string;
	ext: string[];
	dirFile: string[];
	dirList: boolean,
	exclude: string[];
	cors: boolean;
	headers: HttpHeaderRule[];
}} ServerOptions

@typedef {{
	host: string;
	ports: number[];
}} ListenOptions

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

@typedef {ResolvedFile & {isParent?: boolean; target?: ResolvedFile}} DirIndexItem

@typedef {{
	readonly startedAt: number;
	endedAt?: number;
	readonly method: string;
	readonly url: string;
	error?: Error | string;
} & ResolveResult} ReqResMeta

**/
