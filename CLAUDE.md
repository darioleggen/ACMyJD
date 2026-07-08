# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"JD Link Sender" is a Manifest V3 browser extension (Chrome/Brave and Firefox) that sends
links/containers to a locally or remotely running JDownloader 2 instance via its ClickNLoad2 (CNL2)
HTTP interface. It's a minimal replacement for MyJDownloader that avoids that service's cloud account
requirement — everything talks directly to JDownloader's `/flash/*` CNL2 endpoints.

There is no build step, package manager, bundler, or test suite — this is plain, unbundled ES modules
loaded directly by the browser extension platform. There is no `package.json`.

## Two manifests, one shared codebase

All JS/HTML/icons are shared verbatim between the Chrome and Firefox builds — only the manifest
differs, because Firefox's MV3 implementation uses a non-persistent background *script* (event page)
instead of Chrome's *service worker*, and requires a stable extension ID:

- `manifest.json` — Chrome/Brave build: `background.service_worker`, no `browser_specific_settings`.
- `manifest.firefox.json` — Firefox build: `background.scripts` (array, still `type: "module"`) plus
  `browser_specific_settings.gecko.id`/`strict_min_version` (Firefox requires an explicit add-on ID
  for MV3, and `storage.session` needs Firefox 115+).

Bump `version` in **both** files together when releasing — nothing enforces they stay in sync.

`scripts/package.ps1` builds `dist/chrome/` and `dist/firefox/` (each a flat folder with the right
`manifest.json` copied in) and zips both — that's what to load unpacked/temporary for testing the
Firefox variant, and what to upload to the Chrome Web Store / addons.mozilla.org.

## Loading and testing the extension

There are no automated tests. To verify changes, load the extension unpacked and exercise it manually:

1. Open `chrome://extensions`, enable Developer Mode, "Load unpacked", select this directory.
2. After editing background.js/config.js/jdApi.js, click the extension's reload button on
   `chrome://extensions` (service workers aren't hot-reloaded).
3. After editing `content-cnl-scanner.js`, also reload any already-open target tab (content scripts
   aren't re-injected into existing tabs).
4. Exercise the right-click context menu ("Invia a JDownloader") in its three contexts: on a link, on a
   text selection, and on empty page space — see Architecture below for what each path does.
5. Use the Options page to point at a real (or mock) JDownloader CNL2 endpoint and use "Prova connessione"
   to sanity-check `/jdcheck.js`.
6. To test the Firefox build: run `scripts/package.ps1`, then in Firefox open
   `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → pick
   `dist/firefox/manifest.json`. Firefox unloads temporary add-ons on browser restart, so re-load
   after each session. Repeat steps 2-5 against this build too since the background script
   (event page vs. service worker) behaves slightly differently.

## Architecture

Everything is Italian-commented; keep new comments in Italian for consistency.

**Single context-menu entry, three trigger contexts, one flow.** `background.js` registers one
context menu item (`jd-send`) valid for `link`, `selection`, and `page` contexts. All three paths
converge on the same pair of popup outcomes: a flat link list/crypted-container confirm popup
(`confirm.html`/`confirm.js`), or — when more than one hoster is present — a per-hoster checkbox
selection popup. Which popup opens is decided by `routeGroupsToPopup` / `routeToPopup` in
`background.js`.

- **Link context** (`info.linkUrl`): `handleLinkResolve` does a silent `fetch()` of the target page and
  parses the raw HTML with regex (`scanCnlBlocksFromHtml`, `scanPlainLinksFromHtml`) — no DOM/tab
  involved. If no CNL2 container or link list is found, it falls back to sending the raw URL.
- **Selection context** (`info.selectionText`): `linkUtils.js#extractLinks` pulls every URL out of the
  selected text, then `handleMultipleLinksResolve` fetches and resolves each one in parallel exactly
  like the link-context path, merging results by hostname (`hostnameMap`) and taking the first
  non-empty package name found across all resolved containers.
- **Page context** (click on empty area): `scanCurrentPage` messages the content script
  (`content-cnl-scanner.js`) injected into every page, which scans the *live DOM* (not raw HTML) for
  the same two patterns and replies over `chrome.runtime.onMessage`.

**Two container formats, detected independently, in that priority order:**
1. **CNL2 crypted blocks** — `<input name="crypted">` plus a nearby `name="jk"` (and optional
   `passwords`/`password`) input. Nearest-by-position matching is used both in the regex scanner
   (`nearest()` in background.js, comparing string offsets) and the DOM scanner (`findSibling()` in
   content-cnl-scanner.js, walking `closest('form')` → `parentElement` → whole-document-if-unique).
2. **Plain link lists** — the first `<textarea>` containing ≥2 lines that look like `http(s)://` URLs
   (pattern seen on sites like lficrypt.org). Package name is read from a
   `<meta name="lficrypt-package">` tag, falling back to the page `<title>` with any `" | "` / `" - "` /
   `" – "` / `" — "` suffix stripped (`extractPageTitle`).

If crypted blocks exist they always win over plain links, per page/selection/DOM-scan resolution.

**Popup state handoff via `chrome.storage.session`, not message passing.** Background scripts write
one of `pendingLinks` / `pendingCryptedBlocks` / `pendingLinkGroups` (+ optional `pendingPackageName`)
to session storage, then open `confirm.html` as a popup window. `confirm.js` reads and immediately
clears those keys on init, and picks its render mode by which key was present (priority:
grouped > crypted > links) — see the `mode` variable in `confirm.js`.

**CNL2 wire format** (`jdApi.js`): plain links go out as a single `GET /flash/add?urls=<CRLF-joined,
url-encoded>&package=...&source=...`; crypted blocks go out as one `POST /flash/addcrypted2` per block
with `crypted`/`jk`/`source`(/`passwords`) form-encoded. `source` is a fixed constant
(`CNL2_SOURCE` in `config.js`), not the current page URL — this deliberately avoids JDownloader's
per-domain "External request from X" confirmation popup.

**Config storage** (`config.js`): the JDownloader base URL lives in `chrome.storage.sync` under
`baseUrl`, editable from the Options page. `getJdConfig()` transparently migrates the old
`host`/`port` pair (pre-1.1) into a `baseUrl` string on read; `options.js` deletes the old keys once
the user saves through the new UI. Read `getJdConfig()` fresh on every send — don't cache the base URL
— so Options changes take effect immediately without reloading the extension.
