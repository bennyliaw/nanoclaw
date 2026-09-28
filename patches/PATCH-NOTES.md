# Patch Notes

## `@chat-adapter__telegram@4.26.0.patch`

**Author:** Benny Yao <bennyliaw@gmail.com>  
**Date:** 2026-06-02  
**Status:** Applied locally via pnpm patch. Pending PR submission to upstream.

### Problem

When a NanoClaw agent calls `send_file()` with an image (`.png`, `.jpg`, etc.), Telegram
receives it as a **document** (file attachment), requiring the user to tap a download button
before viewing. This is because `TelegramAdapter.postMessage()` unconditionally calls
`sendDocument` for all file uploads, regardless of file type.

For image-heavy use cases — map screenshots, charts, dashboards, photo summaries — this
creates unnecessary friction. Telegram's Bot API supports `sendPhoto` for inline image
display, but the adapter never used it.

**Discovered during:** NanoClaw Use Case 1.1 — a typhoon tracking agent sending map images
every 10 minutes to Telegram. The maps arrived as downloads rather than inline photos.

### Fix

Added a `sendPhoto` method to `TelegramAdapter` (mirrors `sendDocument` with `"photo"`
field and `"sendPhoto"` endpoint). In `postMessage`, the file's extension is checked: if it
is a recognised image type (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`), `sendPhoto` is used;
otherwise `sendDocument` is used as before.

**Changed:** `dist/index.js`

- Line ~620: replaced unconditional `sendDocument` call with extension-based branch
- Line ~1035: added `sendPhoto` method

### Behaviour

| File type | Before | After |
|-----------|--------|-------|
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | Sent as document (download required) | Sent as inline photo |
| All other types | Sent as document | Sent as document (unchanged) |

No breaking changes. Document behaviour for non-image files is preserved exactly.

### PR targets

- [ ] `@chat-adapter/telegram` upstream package repo
- [ ] NanoClaw repo (add patch to base installation)
