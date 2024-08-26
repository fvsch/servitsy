/**
@typedef {{ error?: string; warn?: string }} ErrorMessage

@typedef {'dir' | 'file' | null} FSEntryKind

@typedef {{ filePath: string; kind: FSEntryKind }} FSEntryBase

@typedef {{
	kind: (filePath: string) => Promise<FSEntryKind>;
	readable: (filePath: string, kind?: FSEntryKind) => Promise<boolean>;
	info: (filePath: string) => Promise<{filePath: string; readable: boolean; kind: FSEntryKind}>;
	index: (dirPath: string) => Promise<{filePath: string; kind: FSEntryKind}[]>;
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

**/
