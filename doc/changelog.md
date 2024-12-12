# servitsy changelog

## v0.5.0 (2024-12-12)

BREAKING:

- Boolean CLI options do not accept a text value anymore (#46). Use the `--no-*` prefix for negative values. For example, for a boolean option named `gzip`, use `--gzip` (true) and `--no-gzip` (false).
- Renamed `--dir-file` option to `--index` (#53)
- Renamed `--dir-list` option to `--list` (#54)
- Removed empty `lib/index.js` entrypoint (#55)

Misc:

- fix: leave host blank by default (#49)
- fix: use trailing slashes in URLs to directories (#48)

## v0.4.5 (2024-11-19)

- fix: improved validation for some options (#39)

## v0.4.4 (2024-11-15)

- Several refactoring changes changes (#34, #35, #36, #37), resulting in ~15% smaller package size.

## v0.4.3 (2024-11-08)

- fix(deno): bundle assets to avoid permission prompt (#33)

## v0.4.2 (2024-11-04)

- fix: better symlink handling (#31)

## v0.4.1 (2024-10-25)

- fix(deno): check required dir access before server start (#27)
- fix(deno): handle.stat not available (#30)

## v0.4.0 (2024-10-20)

- BREAKING: invalid CLI arguments now stop the program (#26)
- refactor: split arg parsing and option validation (#26)

## v0.3.3 (2024-10-14)

- fix: improve deno compatibility (#25)

## v0.3.2 (2024-10-12)

- fix: terminal colors in Node 18 and Deno (#24)

## v0.3.1 (2024-10-11)

- refactor: remove unnecessary fs abstraction (#23)
- docs: clarify usage with npx, move options docs out of README.md

## v0.3.0 (2024-10-09)

- feat: add gzip compression for responses (#22)
- feat: add duration to logs (#22)
- fix: leaky file handles for aborted requests (#21)
- fix: css browser compat issues in directory lists

## v0.2.1 (2024-09-24)

- add MIT license field in package.json

## v0.2.0 (2024-09-24)

- feat: handle HEAD and OPTIONS requests (#20)

## v0.1.3 (2024-09-16)

- add MIT license
- feat: get content-type from file bytes (#18)
- fix: use urlPath in dir listing page (#19)

## v0.1.2 (2024-09-12)

- feat: list symlinks in folders or files depending on target
- fix: better handling of slashes on windows and in tests (#17)
- other fixes and improvements of directory listings

## v0.1.1 (2024-09-07)

- feat: add breadcrumb nav to directory listings (#14)
- fix: tweak display for a WebContainer environment (#13)
- fix: parse and validate `--ext` option correctly (#15)
- fix: parse and validate `--dir-file` option correctly (#16)

## v0.1.0 (2024-09-05)

First release. Initial features include:

- Serve static files over HTTP/1.1.
- Nice looking directory indexes.
- Command line interface only.
- Configuration through CLI arguments `--host`, `--port`, `--header`, `--cors`, `--ext`, `--dir-file`, `--dir-list` and `--exclude`.
