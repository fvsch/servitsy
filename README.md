# (itsy bitsy) servitsy

Local web server for static files, coming in a small package.

- Small: 19.5 kilobytes gzipped, zero dependencies.
- What: for your local testing needs.
- How: with decent defaults, and no cool features.

## Quick start

```sh
npx servitsy [directory] [options]
```

By default, `servitsy` will:

- serve the current directory at `http://localhost:8080` (listening on hostname `0.0.0.0`);
- try the next port numbers if `8080` is not available;
- serve `index.html` files for folders, and `.html` files when the extension was omitted in the URL;
- show directory contents (for folders without an index file).

See `npx servitsy --help` — or [the Options section](#options) — if you want to configure this behavior.

## When you shouldn’t use this package

### ⛔️ In production

There are safer and faster tools to serve a folder of static HTML to the public. Apache, Nginx, fastify-static, etc.

### 🤔 For web app development…

… if you want nice dev features like live-reload, transpilation, bundling, etc. — use something like [Vite](https://vitejs.dev/) instead.

### 🌈 If you love another

There are good established alternatives to this package. Here is a brief and subjective comparison of a few packages I like:

| Package                 | Size on disk† | Dependencies | Highlights                 |
| ----------------------- | ------------- | ------------ | -------------------------- |
| servitsy (v0.1.0)       | 100 kB        | 0            | Tiny                       |
| [servor] (v4.0.2)       | 144 kB        | 0            | Tiny, cool features        |
| [sirv-cli] (v2.0.2)     | 392 kB        | 12           | Small, good options        |
| [serve] (v14.2.3)       | 7.6 MB        | 89           | Good defaults, easy to use |
| [http-server] (v14.1.1) | 8.9 MB        | 45           | Good defaults, featureful  |

The philosophy of `servitsy` is to have few opinions and bells and whistles (like `sirv-cli`), and to try to offer that in a zero-dependency package (like `servor`).

If size and dependency count is not a concern and you want something stable and battle-tested, I recommend `serve` and `http-server`.

† Size on disk is the uncompressed size of the package and its dependencies (as reported by `/usr/bin/du` on macOS with an APFS filesystem; exact size may depend on the OS and/or filesystem).

[http-server]: https://www.npmjs.com/package/serve
[serve]: https://www.npmjs.com/package/serve
[servor]: https://www.npmjs.com/package/servor
[sirv-cli]: https://www.npmjs.com/package/sirv-cli

## Options

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

### `headers`

Add custom HTTP headers to responses, for all files or specific file patterns. Headers can be provided using a `header:value` syntax, or as a JSON string:

```sh
# header:value syntax
servitsy --headers 'cache-control: max-age=5' --headers 'server: servitsy'

# JSON syntax
servitsy --headers '{"cache-control": "max-age=5", "server": "servitsy"}'
```

To add headers to specific responses, use file matching patterns before the value:

```sh
# header:value syntax
servitsy --headers '*.rst content-type: text/x-rst'

# JSON syntax
servitsy --headers '*.rst {"content-type": "text/x-rst"}'
```

See the [`exclude` option](#exclude) for more information about file matching patterns.
