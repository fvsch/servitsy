/**

@typedef {'cors' | 'dirFile' | 'dirList' | 'exclude' | 'ext' | 'header' | 'help' | 'host' | 'port' | 'version'} OptionName
@typedef {{ args: string[]; help: string; argDefault?: string }} OptionSpec

@typedef {{
	initial: number;
	count: number;
	countLimit: number;
}} PortsConfig

@typedef {{ error?: string; warn?: string }} ErrorMessage

@typedef {'dir' | 'file' | 'link' | null} FSEntryKind
@typedef {{ filePath: string; kind: FSEntryKind }} FSEntryBase

@typedef {{
	dirSep: '/' | '\\';
	join(...paths: string[]): string;
	relative(from: string, to: string): string;
	index(dirPath: string): Promise<{filePath: string; kind: FSEntryKind}[]>;
	info(filePath: string): Promise<{filePath: string; readable: boolean; kind: FSEntryKind}>;
	kind(filePath: string): Promise<FSEntryKind>;
	readable(filePath: string, kind?: FSEntryKind): Promise<boolean>;
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
	status: number;
	urlPath: string;
	filePath: string | null;
	kind: FSEntryKind;
}} ResolveResult

@typedef {ResolveResult & {
	method: string;
	root: string;
	startedAt: number;
	endedAt?: number;
	error?: Error | string;
}} ReqResInfo

**/
