# 🎵 FreeTune · 自由音乐

A self-hosted, installable music web app that lets you search and stream free
Chinese (and global) music again — even from the US, where QQ Music / Kugou /
NetEase apps are geo-blocked. Looks and feels like QQ Music / NetEase Cloud Music.

- 📱 **iPhone-ready PWA** — add to Home Screen, full-screen Now Playing, lock-screen controls
- 🔀 Searches **NetEase / Kuwo / QQ音乐 / Migu / Kugou** with automatic cross-source fallback
- 🎤 Synced lyrics, album art, favorites, queue
- 🚀 Two ways to run: **locally** (Python, zero deps) or **deployed to Netlify** (edge functions)

---

## How it works (why it plays from the US)

The official China apps block overseas IPs, and the classic direct tricks are
dead (NetEase returns 404, Kuwo needs live tokens). FreeTune instead calls a
**public multi-source aggregator** that resolves real, playable audio URLs
server-side, and then **proxies the audio through your own backend** so the
browser never hits CORS, referer checks, mixed content, or geo-blocks. Your
browser only ever talks to your own origin.

---

## Option A — Run locally (no install)

Requires the built-in macOS **Python 3** (no Homebrew / pip / Node needed).

```bash
cd /Users/jiankuang/Projects/Music
python3 server.py            # http://127.0.0.1:8808
```

Or double-click **`start.command`** in Finder.

---

## Option B — Deploy to Netlify (recommended for iPhone use)

The backend is implemented as **Netlify Edge Functions** (Deno) so no server is
needed — the same `/api/*` and `/stream` routes work in the cloud.

**Easiest (drag & drop):**
1. Go to <https://app.netlify.com/drop>
2. Drag the entire **`Music`** folder (it must include `netlify.toml`,
   `netlify/`, and `web/`) onto the page.
3. Done — open the generated `*.netlify.app` URL on your iPhone.

**Via Git / CLI:**
```bash
# from the project root
npx netlify-cli deploy --prod
# or push to a GitHub repo and "Import" it in the Netlify dashboard
```
Netlify auto-detects `netlify.toml`: it publishes `web/` and loads the edge
functions in `netlify/edge-functions/`. No build command required.

### Add to iPhone Home Screen
On the deployed site in Safari: **Share → Add to Home Screen**. It launches
full-screen like a native app, with lock-screen / Control Center playback.

---

## Using it

- **Search**: type a song/artist, press Enter (or the search key).
- **Source / Quality**: top bar dropdowns. If a song won't play, the backend
  auto-tries the other sources; you can also switch the source manually.
- **Mobile**: tap the bottom mini-player to open the full-screen Now Playing
  screen (swipe down to close). Bottom tabs switch Search / Queue / Favorites.
- **Favorites**: tap 🤍 (stored locally in your browser).
- **Desktop keys**: Space = play/pause, ← / → = prev / next.

---

## Project layout

```
server.py                       # local backend (zero-dependency Python)
start.command                   # double-click launcher (macOS, local)
netlify.toml                    # Netlify config (publish web/, edge functions)
netlify/edge-functions/         # Deno backend for Netlify
  _shared.ts                    #   API client + multi-source fallback
  search.ts  url.ts  lyric.ts   #   JSON endpoints
  pic.ts     stream.ts          #   cover art + audio streaming proxy
web/
  index.html  styles.css  app.js
  manifest.json  icon.svg       # PWA assets
```

## Notes / limitations

- For personal listening. Some VIP-only / unreleased tracks may not resolve on
  any source.
- Depends on a third-party public aggregator being up. If audio stops resolving,
  change the `API` constant in **both** `server.py` and
  `netlify/edge-functions/_shared.ts` to another Meting-style endpoint.
