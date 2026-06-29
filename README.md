# Pin Paper — Website

Marketing and download site for **Pin Paper**, a Mac and Windows app that turns your
Pinterest boards and local folders into custom desktop wallpapers. Link a board or pick a
folder, lay out image frames on a canvas, and generate a wallpaper set sized for your screen.

## Run locally

```bash
node serve.mjs
# → http://localhost:3000
```

`serve.mjs` is a tiny dependency-free Node static server.

## Download tracking

The download buttons hit `/download/mac` and `/download/windows`. Each is counted
(de-duped per browser, so it approximates people rather than raw clicks) and persisted to
`download-stats.json`.

- **Dashboard:** `/stats`
- **JSON:** `/api/downloads` → `{ "mac": 0, "windows": 0, "total": 0 }`

Set the real installer links at the top of `serve.mjs`, or via environment variables:

```bash
PINPAPER_MAC_URL="https://.../PinPaper.dmg" \
PINPAPER_WIN_URL="https://.../PinPaper-Setup.exe" \
node serve.mjs
```

The page also fires a `download` event to Google Analytics (`gtag`) / GTM (`dataLayer`)
if either is present.

## Structure

- `index.html` — the site (single file, inline styles, DM Sans + Inter, brand red `#E71C23`)
- `serve.mjs` — dev server + download counter
- `assets/` — logo and favicons
