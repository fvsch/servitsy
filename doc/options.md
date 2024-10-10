# servitsy options

servitsy supports the following command-line options:

- [`--cors`](#cors): send CORS HTTP headers in responses
- [`--dir-file`](#dirfile): directory index file(s)
- [`--dir-list`](#dirlist): allow listing directory contents
- [`--exclude`](#exclude)
- [`--ext`](#ext): extensions which can be omitted in URLs
- [`--gzip`](#gzip): use gzip compression for text files
- [`--header`](#header): add custom HTTP header(s) to responses
- [`--host`](#host): bind to a specific host
- [`--port`](#port): bind to a specific port or ports

> [!NOTE]  
> Examples on this page use the `servitsy` command. If you haven't installed servitsy globally, you can use `npx servitsy` instead.

## `cors`

Adds [Cross-Origin Resource Sharing](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) headers to responses. Defaults to `false`.

Currently, setting this option to `true` will add a `Access-Control-Allow-Origin: *` header with every response (except directory listings).

```sh
# Enable
servitsy --cors
servitsy --cors true

# Disable (default)
servitsy --cors false
```

## `dirFile`

File names to look up when a request matches a directory. Defaults to `index.html`.

```sh
servitsy --dir-file 'index.html'
servitsy --dir-file 'page.html,page.htm'
```

## `dirList`

Whether to list directory contents when a request matches a directory and no `dirFile` is found. Defaults to `true`.

```sh
# Enable (default)
servitsy --dir-list
servitsy --dir-list true

# Disable
servitsy --dir-list false
```

## `exclude`

Block access to files and folders matched by the provided pattern(s). Patterns may use the wildcard character `*`, but not slashes or colons (`/`, `\` or `:`). Use a pattern starting with `!` to negate an exclusion rule.

Defaults to blocking all dotfiles, except for `.well-known` (see [Well-known URI](https://en.wikipedia.org/wiki/Well-known_URI)):

```sh
servitsy --exclude '.*' --exclude '!.well-known'
```

Patterns can also be provided as comma-separated values:

```sh
servitsy --exclude '.*,!.well-known'
```

Blocked requests will result in a 404 error. Requests will be blocked if any file or folder name in the requested path matches an exclusion rule (and does not also match a negative exclusion rule).

For example, if a request resolves to a readable file at `<root_dir>/subfolder/data.json`, access will be:

- blocked with `--exclude 'sub*'` (fully matches `subfolder`);
- blocked with `--exclude '*.js*'` (fully matches `data.json`);
- _allowed_ for `--exclude '.json'` (does _not_ fully match `data.json`).

## `ext`

File extensions to look for when resolving a request. Defaults to `.html`.

Typically, this allows serving a `<root_dir>/page-name.html` file for a request URL path of `/page-name`.

```sh
servitsy --ext '' # disable
servitsy --ext '.html' # default
servitsy --ext '.xhtml' --ext '.html'
```

## `gzip`

Enables gzip compression for text files. Defaults to `true`.

```sh
# Enable (default)
servitsy --gzip
servitsy --gzip true

# Disable
servitsy --gzip false
```

## `header`

Add custom HTTP headers to responses, for all files or specific file patterns. Headers can be provided using a `header:value` syntax, or as a JSON string:

```sh
# header:value syntax
servitsy --header 'cache-control: max-age=5' --header 'server: servitsy'

# JSON syntax
servitsy --header '{"cache-control": "max-age=5", "server": "servitsy"}'
```

To add headers to specific responses, use file matching patterns before the value:

```sh
# header:value syntax
servitsy --header '*.rst content-type: text/x-rst'

# JSON syntax
servitsy --header '*.rst {"content-type": "text/x-rst"}'
```

See the [`exclude` option](#exclude) for more information about file matching patterns.

## `host`

Host address that the server will listen on. May be a domain name or an IP address.

Defaults to `0.0.0.0`, which means that the server will be available both on `http://localhost:<port>/` and from other computers connected to the same network.

```sh
servitsy --host localhost
servitsy --host mysite.local
```

## `port`

Port number to use for the server. Three formats are supported:

```sh
servitsy --port 3000
servitsy --port 3000+
servitsy --port 8080-8099
```

- `<number>`: specify a single port number, will error out if that port is busy;
- `<number>+`: specifies the first port number to try, and allow trying the next few port numbers if the first one is busy;
- `<number>-<number>`: a range of port numbers to try (from first to last).

Defaults to `8080+`.
