# TTF to WOFF2 Converter

TTF to WOFF2 Converter is a small desktop Python GUI for converting `.ttf` font
files to `.woff2` files.

## Features

- Add individual `.ttf` files with a file picker.
- Add all `.ttf` files from a selected folder.
- Drag `.ttf` files or folders into the drop area.
- Keep a visible queue of files before conversion.
- Remove selected files or clear the queue.
- Optionally overwrite existing `.woff2` files.
- Convert in a background thread so the window stays responsive.
- Show progress and conversion results in the log panel.

## Repository Layout

```text
ttf2woff2/
  .gitignore
  LICENSE
  README.md
  requirements.txt
  ttf2woff2.py
  ttf2woff2_gui.spec
```

`ttf2woff2.py` is the application entry point. The existing
`ttf2woff2_gui.exe` file is a local packaged build artefact and is ignored by
Git.

## Dependencies

- Python 3.10 or newer
- fonttools
- PySide6

Install dependencies into the same Python environment used to run the app:

```powershell
python -m pip install -r requirements.txt
```

## Run

Run from the repository root:

```powershell
python ttf2woff2.py
```

## Checks

Check that the script parses correctly:

```powershell
python -m py_compile ttf2woff2.py
```

## Git Ignore

The `.gitignore` excludes Python caches, virtual environments, package build
outputs, coverage artefacts, editor folders, OS metadata, local `.exe` builds,
generated `.woff2` files, and logs.

## Licence

This project is licensed under the GNU General Public License v3.0.

Copyright (C) 2026 strailico5327.

## Notes

This project was developed with assistance from OpenAI Codex. The code has been reviewed and tested before release.
