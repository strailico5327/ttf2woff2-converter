# TTF to WOFF2 Converter Web

A pure frontend tool for converting `.ttf` font files to `.woff2` in the browser.
Files are processed locally and are not uploaded to a server.

## Features

- Add individual `.ttf` files.
- Add every `.ttf` file from a folder.
- Drag files or folders into the drop area.
- Review and remove queued files before conversion.
- Convert fonts with WebAssembly in the browser.
- Download each `.woff2` file or download all results as a ZIP archive.

## Requirements

- Node.js 18 or newer
- npm

## Install

```powershell
npm install
```

## Development

```powershell
npm run dev
```

The Vite development server binds to `127.0.0.1` by default.

## Build

```powershell
npm run build
```

The static site is generated in `dist/`. Upload the contents of `dist/` to any
static host, or publish the project source to GitHub and configure your own
deployment workflow.

## Preview Production Build

```powershell
npm run preview
```

## Privacy

The converter runs entirely in the browser. Font files stay on your device unless
you choose to upload or share them somewhere else.

## License

This project is licensed under the GNU General Public License v3.0. See
[`LICENSE`](LICENSE) for details.

Copyright (C) 2026 strailico5327.
