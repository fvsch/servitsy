# servitsy options

servitsy supports the following command-line options:

- [`host`](#host): specify a custom host
- [`port`](#port): specify a custom port or range of ports
- [`cors`](#cors): send CORS HTTP headers in responses
- [`dirList`](#dirlist): allow or disallow directory listings
- [`exclude`](#exclude): deny file access by pattern
- [`ext`](#ext): extensions used to resolve URLs
- [`gzip`](#gzip): enable or disable gzip compression
- [`header`](#header): add custom HTTP header(s) to responses
- [`index`](#index): directory index file(s)

> [!NOTE]  
> Examples on this page use the `servitsy` command. If you haven't installed servitsy globally, you can use `npx servitsy` instead.

## `host`

The host address that the server will listen on. May be a domain name or an IP address.

```sh
# Accept connections for any host (same as default)
servitsy -h '::'

# Restrict to connections on 'localhost'
servitsy -h localhost

# Use a custom host name (must resolve to localhost IP)
servitsy --host mysite.local
```

The `host` option defaults to Node's behavior:

> If `host` is omitted, the server will accept connections on the [unspecified IPv6 address](https://en.wikipedia.org/wiki/IPv6_address#Unspecified_address) (`::`) when IPv6 is available, or the [unspecified IPv4 address](https://en.wikipedia.org/wiki/0.0.0.0) (`0.0.0.0`) otherwise.

Usually, listening on the unspecified IPv6/v4 address means that the server may be reachable by other computers connected to the same network, for instance on an IPv4 address looking like `http://192.168.1.XX:8080`. (This can vary depending on your firewall or router configuration.)

> [!CAUTION]
> If not all computers on the local network are trusted, exposing local content as a website on the local network can be a confidentiality or security risk. Use `--host=localhost` if this is a concern.

## `port`

The port number to listen on, and optionally the port numbers to try as fallback if the first port is busy. Defaults to `8080+`.

Three formats are supported:

```sh
servitsy --port 3000
servitsy --port 3000+
servitsy --port 8080-8099
```

- `<number>`: specify a single port number, will error out if that port is busy;
- `<number>+`: specifies the first port number to try, and allow trying the next few port numbers if the first one is busy;
- `<number>-<number>`: a range of port numbers to try (from first to last).

## `cors`

Adds [Cross-Origin Resource Sharing](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) headers to responses. Off by default.

Currently, enabling this optionwill add a `Access-Control-Allow-Origin: *` header with every response (except directory listings).

```sh
# Enable
servitsy --cors

# Disable (same as default)
servitsy --no-cors
```

## `dirList`

Enables or disables listing directory contents, when a request matches a directory and no `index` file is found in that directory. Enabled by default.

```sh
# Serve directory listings (same as default)
servitsy --dirlist

# Disable: do not serve directory listings
servitsy --no-dirlist
```

## `exclude`

Denies access to files and folders matched by the provided file patterns. Defaults to blocking all dotfiles, except for `.well-known` (see [Well-known URI](https://en.wikipedia.org/wiki/Well-known_URI)).

Note that specifying any `exclude` value will override the defaults. If you still want to block dotfiles, make sure to include `'.*'` in your custom patterns.

```sh
# Default value
servitsy --exclude '.*, !.well-known'

# Custom values
servitsy --exclude '.*, _*' --exclude '*.yml, *.yaml'

# Disable this feature
servitsy --no-exclude  # or --exclude=''
```

Patterns may use the wildcard character `*`, but not slashes or colons (`/`, `\` or `:`). Use a pattern starting with `!` to negate an exclusion rule.

Blocked requests will show up as a 404 (Not Found) response. Requests will be blocked if any file or folder name in the requested path matches an exclusion rule (and does not also match a negative exclusion rule).

For example, if a request resolves to a readable file at `<root_dir>/subfolder/data.json`, access will be:

- denied with `--exclude 'sub*'` (fully matches `subfolder`);
- denied with `--exclude '*.js*'` (fully matches `data.json`);
- _allowed_ for `--exclude '.json'` (does _not_ fully match `data.json`).

## `ext`

File extensions used to resolve URLs. Defaults to `'.html'`.

Typically, this allows serving a `<root_dir>/page-name.html` file for a request URL path of `/page-name`.

```sh
# Default value
servitsy --ext '.html'

# Custom values
servitsy --ext '.xhtml' --ext '.html'

# Disable defaults
servitsy --no-ext  # or --ext=''
```

## `gzip`

Enables or disables gzip compression for text files. Enabled by default.

```sh
# Enable (same as default)
servitsy --gzip

# Disable
servitsy --no-gzip
```

## `header`

Adds custom HTTP headers to responses, for all files or specific file patterns. Headers can be provided using a `header:value` syntax, or as a JSON string:

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

## `index`

File names to look up when a request matches a directory. Defaults to `index.html`.

```sh
# Default value
servitsy --index 'index.html'

# Custom values
servitsy --index 'index.html,index.htm' --index 'page.html,page.htm'

# Disable defaults
servitsy --no-index  # or --index=''
```
