import type { FileHandle } from 'node:fs/promises';
import { basename, extname } from 'node:path';

interface TypeMap {
	default: string;
	file: string[];
	extension: string[];
	extensionMap: Record<string, string>;
	suffix: string[];
}

const strarr = (s = '') => s.trim().split(/\s+/);

const TEXT_TYPES: TypeMap = {
	default: 'text/plain',
	extensionMap: {
		atom: 'application/atom+xml',
		cjs: 'text/javascript',
		css: 'text/css',
		csv: 'text/csv',
		htm: 'text/html',
		html: 'text/html',
		ics: 'text/calendar',
		js: 'text/javascript',
		json: 'application/json',
		json5: 'text/plain',
		jsonc: 'text/plain',
		jsonld: 'application/ld+json',
		map: 'application/json',
		md: 'text/markdown',
		mdown: 'text/markdown',
		mjs: 'text/javascript',
		rss: 'application/rss+xml',
		sql: 'application/sql',
		svg: 'image/svg+xml',
		text: 'text/plain',
		txt: 'text/plain',
		xhtml: 'application/xhtml+xml',
		xml: 'application/xml',
	},
	// Loosely based on npm:textextensions
	extension: strarr(`
		ada adb ads as ascx asm asmx asp aspx astro atom
		bas bat bbcolors bdsgroup bdsproj bib
		c cbl cc cfc cfg cfm cfml cgi clj cls cmake cmd cnf cob coffee conf cpp cpt cpy crt cs cson csr ctl cxx
		dart dfm diff dof dpk dproj dtd
		eco ejs el emacs eml ent erb erl ex exs
		for fpp frm ftn
		go gpp gradle groovy groupproj grunit gtmpl
		h haml hbs hh hpp hrl hs hta htc hxx
		iced inc ini ino int itcl itk
		jade java jhtm jhtml js jsp jspx jsx
		latex less lhs liquid lisp log ls lsp lua
		m mak markdown mdwn mdx metadata mht mhtml mjs mk mkd mkdn mkdown ml mli mm mxml
		nfm nfo njk noon
		ops pas pasm patch pbxproj pch pem pg php pir pl pm pmc pod pot properties props ps1 pt pug py
		r rake rb rdoc resx rhtml rjs rlib rmd ron rs rst rtf rxml
		s sass scala scm scss sh shtml sls spec sql sqlite ss sss st strings sty styl stylus sub sv svc svelte
		t tcl tex textile tg tmpl toml tpl ts tsv tsx tt tt2 ttml txt
		v vb vbs vh vhd vhdl vim vue
		wxml wxss x-php xaml xht xs xsd xsl xslt
	`),
	file: strarr(`
		.gitattributes .gitkeep .gitignore .gitmodules
		.htaccess .htpasswd
		.viminfo .vimrc
		changelog license readme
	`),
	suffix: strarr(`config file html ignore rc`),
};

const BIN_TYPES: TypeMap = {
	default: 'application/octet-stream',
	extensionMap: {
		'7z': 'application/x-7z-compressed',
		aac: 'audio/aac',
		apng: 'image/apng',
		aif: 'audio/aiff',
		aiff: 'audio/aiff',
		avi: 'video/x-msvideo',
		avif: 'image/avif',
		bmp: 'image/bmp',
		bz: 'application/x-bzip',
		bz2: 'application/x-bzip2',
		doc: 'application/msword',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		epub: 'application/epub+zip',
		flac: 'audio/flac',
		gif: 'image/gif',
		gzip: 'application/gzip',
		gz: 'application/gzip',
		ico: 'image/x-icon',
		jpg: 'image/jpg',
		jpeg: 'image/jpg',
		jar: 'application/zip',
		jxl: 'image/jxl',
		jxr: 'image/jxr',
		mid: 'audio/midi',
		midi: 'audio/midi',
		mp3: 'audio/mpeg',
		mp4: 'video/mp4',
		mpeg: 'video/mpeg',
		ods: 'application/vnd.oasis.opendocument.spreadsheet',
		odt: 'application/vnd.oasis.opendocument.text',
		oga: 'audio/ogg',
		ogg: 'audio/ogg',
		ogv: 'video/ogg',
		opus: 'audio/opus',
		otf: 'font/otf',
		pdf: 'application/pdf',
		ppt: 'application/vnd.ms-powerpoint',
		pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		png: 'image/png',
		rar: 'application/vnd.rar',
		rtf: 'application/rtf',
		tar: 'application/x-tar',
		tif: 'image/tiff',
		tiff: 'image/tiff',
		ttf: 'font/ttf',
		wav: 'audio/wav',
		weba: 'audio/webm',
		webm: 'video/webm',
		webp: 'image/webp',
		woff: 'font/woff',
		woff2: 'font/woff2',
		xls: 'application/vnd.ms-excel',
		xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		yaml: 'application/yaml',
		yml: 'application/yaml',
		zip: 'application/zip',
	},
	extension: strarr('bin dng exe link pkg msi so'),
	file: [],
	suffix: [],
};

export class TypeResult {
	group: 'text' | 'bin' | 'unknown' = 'unknown';
	type: string = BIN_TYPES.default;
	charset: string = '';

	constructor(charset: string = 'UTF-8') {
		if (typeof charset === 'string') this.charset = charset;
	}

	bin(type = BIN_TYPES.default) {
		this.group = 'bin';
		this.type = type;
		return this;
	}

	text(type = TEXT_TYPES.default) {
		this.group = 'text';
		this.type = type;
		return this;
	}

	unknown() {
		this.group = 'unknown';
		this.type = BIN_TYPES.default;
		return this;
	}

	toString() {
		if (this.group === 'text') {
			const suffix = this.charset ? `; charset=${this.charset}` : '';
			return `${this.type || TEXT_TYPES.default}${suffix}`;
		}
		return this.type || BIN_TYPES.default;
	}
}

export function typeForFilePath(filePath: string, charset?: string): TypeResult {
	const result = new TypeResult(charset);

	const name = filePath ? basename(filePath).toLowerCase() : '';
	const ext = name ? extname(name).replace('.', '') : '';

	if (ext) {
		if (Object.hasOwn(TEXT_TYPES.extensionMap, ext)) {
			return result.text(TEXT_TYPES.extensionMap[ext]);
		} else if (Object.hasOwn(BIN_TYPES.extensionMap, ext)) {
			return result.bin(BIN_TYPES.extensionMap[ext]);
		} else if (TEXT_TYPES.extension.includes(ext)) {
			return result.text();
		} else if (BIN_TYPES.extension.includes(ext)) {
			return result.bin();
		}
	} else if (name) {
		if (TEXT_TYPES.file.includes(name) || TEXT_TYPES.suffix.find((x) => name.endsWith(x))) {
			return result.text();
		}
	}

	return result.unknown();
}

async function typeForFile(handle: FileHandle, charset?: string): Promise<TypeResult> {
	const result = new TypeResult(charset);
	try {
		const { buffer, bytesRead } = await handle.read({
			buffer: new Uint8Array(1500),
			offset: 0,
		});
		if (isBinHeader(buffer.subarray(0, bytesRead))) {
			return result.bin();
		} else {
			return result.text();
		}
	} catch {
		return result.unknown();
	}
}

export async function getContentType({
	path,
	handle,
}: {
	path?: string;
	handle?: FileHandle;
}): Promise<TypeResult> {
	if (path) {
		const result = typeForFilePath(path);
		if (result.group !== 'unknown') {
			return result;
		}
	}
	if (handle) {
		const result = await typeForFile(handle);
		return result;
	}
	return new TypeResult().unknown();
}

/**
https://mimesniff.spec.whatwg.org/#sniffing-a-mislabeled-binary-resource
*/
export function isBinHeader(bytes: Uint8Array): boolean {
	const limit = Math.min(bytes.length, 2000);

	const [b0, b1, b2] = bytes;
	if (
		// UTF-16BE BOM
		(b0 === 0xfe && b1 === 0xff) ||
		// UTF-16LE BOM
		(b0 === 0xff && b1 === 0xfe) ||
		// UTF-8 BOM
		(b0 === 0xef && b1 === 0xbb && b2 === 0xbf)
	) {
		return false;
	}

	for (let i = 0; i < limit; i++) {
		if (isBinDataByte(bytes[i])) {
			return true;
		}
	}

	return false;
}

/**
https://mimesniff.spec.whatwg.org/#binary-data-byte
*/
export function isBinDataByte(int: number): boolean {
	if (int >= 0 && int <= 0x1f) {
		return (
			(int >= 0 && int <= 0x08) ||
			int === 0x0b ||
			(int >= 0x0e && int <= 0x1a) ||
			(int >= 0x1c && int <= 0x1f)
		);
	}
	return false;
}
