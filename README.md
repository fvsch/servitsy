# servitsy

Local HTTP server for static files, coming in a small package.

- **Small:** no dependencies, 27 kilobytes gzipped.
- **Static:** serves static files and directory listings.
- **Local:** designed for single-user local workflows, not for production.

## Usage

```sh
npx servitsy [directory] [options]
```

By default, `servitsy` will:

- serve the current directory at `http://localhost:8080` (listening on hostname `0.0.0.0`);
- try the next port numbers if `8080` is not available;
- serve `index.html` files for folders, and `.html` files when the extension was omitted in the URL;
- list directory contents (for folders without an index file).

You can configure this behavior [with options](#options). Here are a couple examples:

```sh
# serve current folder on port 3000, with CORS headers
npx servitsy -p 3000 --cors

# serve 'dist' folder and disable directory listings
npx servitsy dist --dir-list false
```

## Options

See `npx servitsy --help` for an overview of available options.

### `cors`

Adds [Cross-Origin Resource Sharing](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) headers to responses. Defaults to `false`.

Currently, setting this option to `true` will add a `Access-Control-Allow-Origin: *` header with every response (except directory listings).

```sh
# Enable
servitsy --cors
servitsy --cors true

# Disable (default)
servitsy --cors false
```

### `dirFile`

File names to look up when a request matches a directory. Defaults to `index.html`.

```sh
servitsy --dir-file 'index.html'
servitsy --dir-file 'page.html,page.htm'
```

### `dirList`

Whether to list directory contents when a request matches a directory and no `dirFile` is found. Defaults to `true`.

```sh
# Enable (default)
servitsy --dir-list
servitsy --dir-list true

# Disable
servitsy --dir-list false
```

### `exclude`

Block access to files and folders matched by the provided pattern(s). Patterns may use the wildcard character `*`, but not slashes or colons (`/`, `\` or `:`). Use a pattern starting with `!` to negate an exclusion rule.

Defaults to blocking all dotfiles, except for `.well-known` (see [Well-known URI](https://en.wikipedia.org/wiki/Well-known_URI)):

```sh
servitsy --exclude '.*' --exclude '!.well-known'
```

Patterns can also be provided as comma-separated values:

```sh
servitsy --exclude '.*,!.well-known'
```

Blocked requests will result in a 404 error. A request will be block if any file or folder name in the requested file's path matches an exclusion rule (while not matching a negative exclusion rule).

For example, if a request resolves to a readable file at `<root_dir>/subfolder/data.json`, access will be:

- blocked with `--exclude 'sub*'` (fully matches `subfolder`);
- blocked with `--exclude '*.js*'` (fully matches `data.json`);
- _allowed_ for `--exclude '.json'` (does _not_ fully match `data.json`).

### `ext`

File extensions to look for when resolving a request. Defaults to `.html`.

Typically, this allows serving a `page-name.html` file for a request URL path of `/page-name`.

```sh
servitsy --ext '' # disable
servitsy --ext '.html' # default
servitsy --ext '.xhtml' --ext '.html'
```

### `gzip`

Enables gzip compression for text files. Defaults to `true`.

```sh
# Enable (default)
servitsy --gzip
servitsy --gzip true

# Disable
servitsy --gzip false
```

### `header`

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

### `host`

Host address that the server will listen on. May be a domain name or an IP address.

Defaults to `0.0.0.0`, which means that the server will be available both on `http://localhost:<port>/` and from other computers connected to the same network.

```sh
servitsy --host localhost
servitsy --host mysite.local
```

### `port`

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

## Alternatives

> __🚨 Reminder: `servitsy` is not designed for production.__ There are safer and faster tools to serve a folder of static HTML to the public. See Apache, Nginx, [@fastify/static], etc.

For local testing, here are a few established alternatives you may prefer, with their respective size:

| Package       | Version | Dependencies | Size on disk† |
| ------------- | ------- | ------------ | ------------- |
| [servitsy]    | 0.3.0   | 0            | 128 kB        |
| [servor]      | 4.0.2   | 0            | 144 kB        |
| [sirv-cli]    | 2.0.2   | 12           | 392 kB        |
| [serve]       | 14.2.3  | 89           | 7.6 MB        |
| [http-server] | 14.1.1  | 45           | 8.9 MB        |

If size and dependency count is not a concern and you want something stable and battle-tested, I recommend [serve] and [http-server].

Otherwise, [servor], [sirv-cli] or [servitsy] might work for you.

_† Size on disk is the uncompressed size of the package and its dependencies (as reported by `du` on macOS; exact size may depend on the OS and/or filesystem)._

[@fastify/static]: https://www.npmjs.com/package/@fastify/static
[http-server]: https://www.npmjs.com/package/http-server
[serve]: https://www.npmjs.com/package/serve
[servitsy]: https://www.npmjs.com/package/servitsy
[servor]: https://www.npmjs.com/package/servor
[sirv-cli]: https://www.npmjs.com/package/sirv-cli
