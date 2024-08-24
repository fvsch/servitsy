/**
@typedef {{ default: string; file: string[]; extension: string[]; extensionMap: Record<string, string>; suffix: string[] }} ContentTypes
@typedef {'help' | 'version' | 'host' | 'port' | 'ext' | 'dirFile' | 'dirList' | 'exclude' | 'cors' | 'headers'} OptionName
@typedef {{ args: string[]; help: string }} OptionSpec
@typedef {{ initial: number; count: number }} PortsConfig
@typedef {{ minValue: number; maxValue: number; countLimit: number }} PortsRules
**/

/** @type {readonly string[]} */
export const EXTENSIONS_DEFAULT = Object.freeze(['.html']);

/** @type {readonly string[]} */
export const DIR_FILE_DEFAULT = Object.freeze(['index.html']);

/** @type {readonly string[]} */
export const FILE_EXCLUDE_DEFAULT = Object.freeze(['.*', '!.well-known']);

/** @type {readonly string[]} */
export const HOSTS_LOCAL = Object.freeze(['localhost', '127.0.0.1', '::1']);

/** @type {{ v4: string; v6: string }} */
export const HOSTS_WILDCARD = Object.freeze({
	v4: '0.0.0.0',
	v6: '::',
});

/** @type {PortsConfig} */
export const PORTS_CONFIG = Object.freeze({
	initial: 8080,
	count: 10,
});

/** @type {PortsRules} */
export const PORTS_RULES = Object.freeze({
	minValue: 1,
	maxValue: 65_535,
	countLimit: 100,
});

/** @type {Record<OptionName, OptionSpec>} */
export const CLI_OPTIONS = Object.freeze({
	help: {
		args: ['--help'],
		help: 'Display this message',
	},
	version: {
		args: ['--version'],
		help: `Display current version`,
	},
	host: {
		args: ['--host', '-h'],
		help: `Bind to a specific host (default '${HOSTS_WILDCARD.v4}')`,
	},
	port: {
		args: ['--port', '-p'],
		help: `Bind to a specific port or ports (default '${PORTS_CONFIG.initial}+')`,
	},
	ext: {
		args: ['--ext'],
		help: `Extensions which can be omitted in URLs (default '${EXTENSIONS_DEFAULT.join(', ')}')`,
	},
	dirFile: {
		args: ['--dir-file'],
		help: `Directory index file(s) (default '${DIR_FILE_DEFAULT.join(', ')}')`,
	},
	dirList: {
		args: ['--dir-list'],
		help: `Allow listing directory contents (default 'true')`,
	},
	exclude: {
		args: ['--exclude'],
		help: `Block access to folders and files matching the specified\npatterns (default '${FILE_EXCLUDE_DEFAULT.join(', ')}')`,
	},
	cors: {
		args: ['--cors'],
		help: `Send CORS HTTP headers in responses (default 'false')`,
	},
	headers: {
		args: ['--headers'],
		help: `Add custom HTTP headers to responses`,
	},
});

export const DEFAULT_CHARSET = 'UTF-8';

/** @type {ContentTypes} */
export const TEXT_TYPES = {
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
	extension:
		`ada adb ads as ascx asm asmx asp aspx atom bas bat bbcolors bdsgroup bdsproj bib c cbl cc cfc cfg cfm cfml cgi clj cls cmake cmd cnf cob coffee conf cpp cpt cpy crt cs cson csr ctl cxx dart dfm diff dof dpk dproj dtd eco ejs el emacs eml ent erb erl ex exs for fpp frm ftn go gpp gradle groovy groupproj grunit gtmpl h haml hbs hh hpp hrl hs hta htc hxx iced inc ini ino int itcl itk jade java jhtm jhtml js jsp jspx jsx less lhs liquid lisp log ls lsp lua m mak markdown mdwn mdx metadata mht mhtml mjs mk mkd mkdn mkdown ml mli mm mxml nfm nfo njk noon ops pas pasm patch pbxproj pch pem pg php pir pl pm pmc pod pot properties props pt pug py r rake rb rdoc resx rhtml rjs rlib rmd ron rs rst rtf rxml s sass scala scm scss shtml sls spec sql sqlite ss sss st strings sty styl stylus sub sv svc t tcl tex textile tg tmpl toml tpl ts tsv tsx tt tt2 ttml txt v vb vbs vh vhd vhdl vim vue wxml wxss x-php xaml xht xs xsd xsl xslt`.split(
			' ',
		),
	file: `.gitattributes .gitkeep .gitignore .gitmodules .htaccess .htpasswd .viminfo .vimrc`.split(
		' ',
	),
	suffix: `config file html ignore rc sh`.split(' '),
};

/**
 * @type {ContentTypes}
 */
export const BIN_TYPES = {
	default: 'application/octet-stream',
	extensionMap: {
		'7z': 'application/x-7z-compressed',
		aac: 'audio/aac',
		apng: 'image/apng',
		avi: 'video/x-msvideo',
		avif: 'image/avif',
		bmp: 'image/bmp',
		bz: 'application/x-bzip',
		bz2: 'application/x-bzip2',
		doc: 'application/msword',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		epub: 'application/epub+zip',
		gif: 'image/gif',
		gzip: 'application/gzip',
		gz: 'application/gzip',
		ico: 'image/x-icon',
		jpg: 'image/jpg',
		jpeg: 'image/jpg',
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
	extension: ['bin', 'so'],
	file: [],
	suffix: [],
};
