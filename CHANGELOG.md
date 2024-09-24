# servitsy changelog

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
