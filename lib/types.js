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
	relative(from: string, to: string): string;
	index(dirPath: string): Promise<FSEntryBase[]>;
	info(filePath: string): Promise<FSEntryBase & {readable: boolean}>;
	kind(filePath: string): Promise<FSEntryKind | null>;
	readable(filePath: string, kind?: FSEntryKind | null): Promise<boolean>;
	realpath(filePath: string): Promise<string | null>;
}} FSUtils

@typedef {{
	root: string;
	ext: string[];
	dirFile: string[];
	dirList: boolean,
	exclude: string[];
}} ResolveOptions

@typedef {{
	include?: string[];
	headers: Record<string, string>;
}} HttpHeaderRule

@typedef {{
	host: string;
	ports: number[];
	cors: boolean;
	headers: HttpHeaderRule[];
}} HttpOptions

@typedef {HttpOptions & ResolveOptions} ServerOptions

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
	startedAt: number;
	endedAt?: number;
	status: number;
	method: string;
	urlPath: string;
	localPath: string | null;
	error?: Error | string;
}} ReqResInfo

**/
