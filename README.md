# servitsy

Small, local HTTP server for static files.

- **Small:** no dependencies, 27 kilobytes gzipped.
- **Local:** designed for local development workflows.
- **Static:** serves files and directory listings.

<img alt="Web browser screenshot of a directory listing for the servitsy source code, served by servitsy on localhost:8080" src="https://raw.githubusercontent.com/fvsch/servitsy/refs/heads/main/doc/example.png" width="820">

## Installation

Use `servitsy` directly with `npx servitsy`, or install it globally with `npm install -g servitsy`.

> ![NOTE]
> `servitsy` is a command-line tool published as a npm package; it requires Node.js 18 or higher.

## Usage

```sh
npx servitsy [directory] [options]
```

By default, `servitsy` will:

- serve the current directory at `http://localhost:8080` (listening on hostname `0.0.0.0`);
- try the next port numbers if `8080` is not available;
- serve `index.html` files for folders, and `.html` files when the extension was omitted in the URL;
- list directory contents (for folders without an index file).

## Options

You can configure the behavior of `servitsy` [with options](https://github.com/fvsch/servitsy/blob/main/doc/options.md). Here are a couple examples:

```sh
# serve current folder on port 3000, with CORS headers
npx servitsy -p 3000 --cors

# serve 'dist' folder and disable directory listings
npx servitsy dist --dir-list false
```

- Use `npx servitsy --help` for an overview of available options.
- Read [doc/options.md](https://github.com/fvsch/servitsy/blob/main/doc/options.md) for details and examples.

## Changelog

See [doc/changelog.md](https://github.com/fvsch/servitsy/blob/main/doc/changelog.md) for the release history.

## License

This package is licensed under [the MIT license](./LICENSE).

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
