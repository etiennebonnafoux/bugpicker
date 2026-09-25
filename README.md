# BugPicker

A Chrome and Firefox extension (Manifest V3) for manual frontend QA: press a shortcut, drag a rectangle over
the problem, type a title, pick labels, submit. BugPicker files a GitHub issue in the repo mapped to
the current website, with the cropped screenshot inline and the page's environment attached.

Personal / small-team tool: loaded unpacked, no store listing, no backend, no analytics.

## Install

```bash
npm ci
npm run build        # or: npm run watch
```

- **Chrome**: open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and
  select `dist/`. Chrome may warn about `background.scripts` and `browser_specific_settings`:
  those keys are for Firefox and are ignored.
- **Firefox** (140+): open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**
  and pick `dist/manifest.json`, or run `npx web-ext run -s dist`. Temporary add-ons are removed
  when Firefox quits; to keep it installed, sign it as an unlisted add-on on
  [addons.mozilla.org](https://addons.mozilla.org/developers/) (`npx web-ext sign -s dist --channel unlisted`).
  If the options page shows **BugPicker can't reach github.com yet**, click **Grant access**: Firefox
  lets you withhold the github.com permissions.

The options page opens on first use: set your GitHub **owner**, a **token** and at least one
**site mapping**.

Shortcut: `Ctrl+Shift+Y` (`⌘+Shift+Y` on macOS), or the toolbar button. Change it at
`chrome://extensions/shortcuts` in Chrome, or `about:addons` → gear menu → **Manage Extension
Shortcuts** in Firefox. On Linux, Firefox already uses `Ctrl+Shift+Y` for the Downloads window, so
pick another key there if the shortcut does nothing.

### Token

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):

- Repository access: **Only select repositories** (every repo used in a mapping), or **All repositories**.
- Permissions: **Issues: Read and write**, **Contents: Read and write** (branch strategy), **Metadata: Read**.

A fine-grained token covers a single account or organization; a mapping whose owner override
points elsewhere shows "no access" when tested.

## How it works

1. **Capture** — the content script is injected on demand (`activeTab`), draws a selection overlay,
   removes it, waits two frames, then the background script calls `captureVisibleTab` and crops with an
   `OffscreenCanvas`. The scale comes from the bitmap width, so the crop is right under browser zoom
   and HiDPI screens. PNGs over 5 MB are re-encoded as JPEG.
2. **Form** — rendered in a closed Shadow DOM, so page CSS can't touch it; keyboard events don't
   leak to the page's shortcuts. It shows the target repo, lets you **Change** it for one issue, or
   **Map this site** when the site has no mapping.
3. **Upload**, before the issue is created, so the body holds the final URL:
   - **web** (preferred): replays github.com's drag-and-drop upload in a fresh background tab using
     your github.com session → a `user-attachments` URL. Undocumented endpoint, may break.
   - **branch** (fallback): commits the image to an orphan branch (`qa-screenshots` by default) and
     links `…/blob/<branch>/<path>?raw=true`, which renders for anyone who can see the repo.
   - `auto` (default) tries web, then branch; the success toast says when the fallback was used.
4. **Issue** — `POST /repos/{owner}/{repo}/issues` with a body containing the description, the
   screenshot and an *Environment* table (page, browser, viewport, DPR, timestamp). If issue creation
   fails, the form keeps its content, offers **Retry** (reusing the uploaded image) and **Download
   screenshot**.

## Site mappings

| Pattern | Matches |
|---|---|
| `example.com` | `example.com`, `www.example.com` — not `app.example.com` |
| `*.example.com` | any subdomain at any depth, and `example.com` |
| `localhost:5173` | that port only (a pattern without a port matches any port) |

The most specific pattern wins: exact beats wildcard, longer beats shorter. A mapping's target is
`(owner override || global owner)/repo`. The options page has a **Which repo for this URL?** checker,
per-mapping **Test** / **Refresh labels**, and JSON **export / import** (the token is never exported).

Labels are cached 10 minutes per repo. Pre-selection: your last selection for that repo, else the
mapping's default labels, else the global default labels.

## Security

- The token lives in `chrome.storage.local` (not exposed to content scripts) and is only used by the
  background script and the options page. It is never sent to a page, including during the web upload.
- The background script validates every message and only files issues into mapped repos.

## Development

```bash
npm run typecheck
npm test             # vitest: site mapping, crop math, issue body, settings, message validation
npm run build
npm run lint:firefox # web-ext lint on dist/ (run after the build)
```

```
src/background/   background (Chrome service worker, Firefox event page): commands, capture, GitHub API, upload strategies
src/content/      selection overlay and issue form (Shadow DOM)
src/options/      options page
src/shared/       pure logic shared by all three (unit-tested)
```

### Manual checklist

Crop exact at 100 % and 125 % zoom on standard and HiDPI screens · overlay absent from the capture ·
Esc cancels selection and form · form immune to aggressive page CSS · typing doesn't trigger page
shortcuts · web upload gives a `user-attachments` URL when logged in, falls back when logged out ·
orphan branch has no shared history with `main` · private-repo images render for collaborators only ·
bad label / revoked token keep the form and Retry works · `chrome://` pages show "not available" on
the toolbar badge · two mapped sites file into their own repos · Map this site / Change work ·
changing the global owner re-targets mappings without an override. Run it in both Chrome and Firefox.

## Not in v1

Annotations, full-page capture, recordings or console logs, OAuth, Safari, per-owner
tokens, path-based mappings.
