# ScreenshotUpload

A MediaWiki extension (targeting **MediaWiki 1.43 LTS**) that lets users paste,
**crop**, **annotate** and upload screenshots — both from the standard upload
form and directly while editing a page.

## Features

- **Amends `Special:Upload`.** A paste/drag-and-drop zone is added to the normal
  upload form. Press `Ctrl+V` to paste a screenshot from the clipboard, or drag
  an image in. The rest of the standard upload flow (licensing, warnings,
  submit) is untouched — the screenshot is simply placed into the existing file
  field and a destination filename is suggested.
- **Crop & annotate before uploading.** Pasting or dropping an image opens an
  editor where you can:
  - **Crop** to a selected region,
  - draw **rectangles**, **ellipses**, **arrows**, freehand **pen** strokes and
    **text**,
  - choose **colour** and **line width**,
  - **undo**.
- **Paste straight into a page.** While editing a page you can paste a
  screenshot; after cropping/annotating, a `[[File:…]]` tag is inserted at the
  cursor **and** the upload page opens in a new tab with the image already
  loaded, so you finish the upload through the normal form. (Toggle the feature
  with `$wgScreenshotUploadEnableOnEdit`; switch the behaviour with
  `$wgScreenshotUploadEditMode`.)

## Installation

1. Copy this directory to `extensions/ScreenshotUpload` in your MediaWiki
   installation.
2. Add to `LocalSettings.php`:

   ```php
   wfLoadExtension( 'ScreenshotUpload' );
   $wgEnableUploads = true;
   ```

3. Make sure users have the `upload` right and that PNG uploads are allowed:

   ```php
   $wgFileExtensions = array_merge( $wgFileExtensions, [ 'png', 'jpg', 'jpeg', 'gif', 'webp' ] );
   ```

## Configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `$wgScreenshotUploadFilenamePrefix` | `"Screenshot"` | Prefix for auto-generated filenames, e.g. `Screenshot 2026-07-13 20-38-05.png`. |
| `$wgScreenshotUploadMaxSize` | `10485760` (10 MB) | Client-side size limit for a pasted image. `$wgMaxUploadSize` still applies server-side. |
| `$wgScreenshotUploadEnableOnEdit` | `true` | Enable pasting a screenshot while editing a page. |
| `$wgScreenshotUploadEditMode` | `"form"` | How an editor paste is handled. `"form"`: insert a `[[File:…]]` tag and open the upload page with the image preloaded. `"api"`: upload silently via the API and insert the tag. |

## Testing with Docker

A ready-to-run MediaWiki 1.43 LTS test environment is included:

```bash
docker compose up --build
```

Then open <http://localhost:8080> and log in as **Admin** / **Admin12345**
(anonymous upload/edit are also enabled to make manual testing easy).

Try it:

- Go to **Special:Upload** and press `Ctrl+V` with a screenshot in the
  clipboard — the editor opens, then the image lands in the upload form.
- Edit any page, paste a screenshot, crop/annotate, and confirm — it uploads and
  inserts a `[[File:…]]` link.

The test wiki is intentionally ephemeral; `docker compose down` resets it.

## How it works

| File | Role |
| --- | --- |
| [extension.json](extension.json) | Manifest: hooks, ResourceLoader modules, config. |
| [src/Hooks.php](src/Hooks.php) | Loads the right JS module on `Special:Upload` / edit pages; exposes config to JS. |
| [resources/screenshot.js](resources/screenshot.js) | Clipboard/drop extraction, validation, filename generation. |
| [resources/annotator.js](resources/annotator.js) | The crop & annotate canvas editor. |
| [resources/upload.js](resources/upload.js) | `Special:Upload` drop zone + form integration. |
| [resources/wikieditor.js](resources/wikieditor.js) | Paste-to-upload-and-insert in the wikitext editor. |
| [i18n/](i18n/) | Interface messages. |

## License

GPL-2.0-or-later.
