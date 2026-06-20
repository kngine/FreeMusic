#!/usr/bin/env python3
"""
FreeTune - a zero-dependency music streaming server.

Runs on the macOS system Python 3 (no pip installs required). It proxies a
public multi-source music aggregator (NetEase / Kuwo / QQ / Migu / ...) and
streams audio through this server so the browser never has to deal with CORS,
referer checks, mixed content, or geo-blocking.

Usage:
    python3 server.py            # serves on http://127.0.0.1:8808
    python3 server.py 9000       # custom port
"""

import json
import ssl
import sys
import socket
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

API = "https://music-api.gdstudio.xyz/api.php"
WEB_DIR = Path(__file__).resolve().parent / "web"
DEFAULT_PORT = 8808

# Sources to try (in order) when the chosen source has no playable URL.
FALLBACK_SOURCES = ["netease", "kuwo", "tencent", "migu", "kugou"]

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")

_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE


# --------------------------------------------------------------------------- #
# Upstream helpers
# --------------------------------------------------------------------------- #

def _open(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    return urllib.request.urlopen(req, timeout=timeout, context=_SSL)


def api_get(params, timeout=20):
    """Call the aggregator API and return parsed JSON (or None on failure)."""
    url = API + "?" + urllib.parse.urlencode(params)
    try:
        with _open(url, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:
        sys.stderr.write(f"[api_get] {params} -> {e!r}\n")
        return None


def resolve_audio(source, song_id, br):
    """Return a direct, playable audio URL string, or '' if unavailable."""
    data = api_get({"types": "url", "source": source, "id": song_id, "br": br})
    if isinstance(data, dict):
        u = data.get("url") or ""
        if u.startswith("http"):
            return u
    return ""


def resolve_with_fallback(source, song_id, br, name, artist):
    """Try the requested source, then search other sources by name+artist."""
    url = resolve_audio(source, song_id, br)
    if url:
        return url, source

    query = " ".join(p for p in [name, artist] if p).strip()
    if not query:
        return "", source

    for alt in FALLBACK_SOURCES:
        if alt == source:
            continue
        results = api_get({"types": "search", "source": alt,
                           "name": query, "count": 5, "pages": 1})
        if not isinstance(results, list):
            continue
        for item in results:
            alt_id = item.get("id") or item.get("url_id")
            if not alt_id:
                continue
            url = resolve_audio(alt, alt_id, br)
            if url:
                return url, alt
    return "", source


# --------------------------------------------------------------------------- #
# HTTP handler
# --------------------------------------------------------------------------- #

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # Quieter logging
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---- helpers ---------------------------------------------------------- #
    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _q(self):
        return urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

    def _one(self, q, key, default=""):
        v = q.get(key, [default])
        return v[0] if v else default

    # ---- routing ---------------------------------------------------------- #
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        try:
            if path == "/api/search":
                return self.handle_search()
            if path == "/api/url":
                return self.handle_url()
            if path == "/api/lyric":
                return self.handle_lyric()
            if path == "/api/pic":
                return self.handle_pic()
            if path == "/stream":
                return self.handle_stream()
            return self.serve_static(path)
        except BrokenPipeError:
            pass
        except ConnectionResetError:
            pass
        except Exception as e:
            sys.stderr.write(f"[handler] {path} -> {e!r}\n")
            try:
                self._send_json({"error": str(e)}, 500)
            except Exception:
                pass

    # ---- API endpoints ---------------------------------------------------- #
    def handle_search(self):
        q = self._q()
        name = self._one(q, "name")
        source = self._one(q, "source", "netease")
        count = self._one(q, "count", "30")
        page = self._one(q, "page", "1")
        if not name.strip():
            return self._send_json([])
        data = api_get({"types": "search", "source": source,
                        "name": name, "count": count, "pages": page})
        if not isinstance(data, list):
            data = []
        out = []
        for it in data:
            artist = it.get("artist")
            if isinstance(artist, list):
                artist = "/".join(artist)
            out.append({
                "id": it.get("id") or it.get("url_id"),
                "name": it.get("name"),
                "artist": artist or "",
                "album": it.get("album") or "",
                "pic_id": it.get("pic_id") or "",
                "lyric_id": it.get("lyric_id") or it.get("id"),
                "source": it.get("source") or source,
            })
        return self._send_json(out)

    def handle_url(self):
        q = self._q()
        url, used = resolve_with_fallback(
            self._one(q, "source", "netease"),
            self._one(q, "id"),
            self._one(q, "br", "320"),
            self._one(q, "name"),
            self._one(q, "artist"),
        )
        return self._send_json({"url": url, "source": used, "ok": bool(url)})

    def handle_lyric(self):
        q = self._q()
        data = api_get({"types": "lyric",
                        "source": self._one(q, "source", "netease"),
                        "id": self._one(q, "id")})
        if not isinstance(data, dict):
            data = {}
        return self._send_json({
            "lyric": data.get("lyric", ""),
            "tlyric": data.get("tlyric", ""),
        })

    def handle_pic(self):
        q = self._q()
        data = api_get({"types": "pic",
                        "source": self._one(q, "source", "netease"),
                        "id": self._one(q, "id"),
                        "size": self._one(q, "size", "300")})
        url = ""
        if isinstance(data, dict):
            url = data.get("url", "")
        return self._send_json({"url": url})

    # ---- audio streaming proxy (supports Range / seeking) ----------------- #
    def handle_stream(self):
        q = self._q()
        audio_url, _ = resolve_with_fallback(
            self._one(q, "source", "netease"),
            self._one(q, "id"),
            self._one(q, "br", "320"),
            self._one(q, "name"),
            self._one(q, "artist"),
        )
        if not audio_url:
            return self._send_json({"error": "no playable source"}, 404)

        headers = {}
        rng = self.headers.get("Range")
        if rng:
            headers["Range"] = rng

        try:
            upstream = _open(audio_url, headers=headers, timeout=30)
        except urllib.error.HTTPError as e:
            return self._send_json({"error": f"upstream {e.code}"}, 502)
        except Exception as e:
            return self._send_json({"error": str(e)}, 502)

        status = getattr(upstream, "status", 200) or 200
        self.send_response(status)
        ctype = upstream.headers.get("Content-Type", "audio/mpeg")
        if "audio" not in ctype and "octet" not in ctype:
            ctype = "audio/mpeg"
        self.send_header("Content-Type", ctype)
        for h in ("Content-Length", "Content-Range", "Accept-Ranges"):
            v = upstream.headers.get(h)
            if v:
                self.send_header(h, v)
        if not upstream.headers.get("Accept-Ranges"):
            self.send_header("Accept-Ranges", "bytes")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        try:
            while True:
                chunk = upstream.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            upstream.close()

    # ---- static files ----------------------------------------------------- #
    def serve_static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        target = (WEB_DIR / path.lstrip("/")).resolve()
        # prevent path traversal
        if WEB_DIR not in target.parents and target != WEB_DIR:
            return self._send_json({"error": "not found"}, 404)
        if not target.is_file():
            return self._send_json({"error": "not found"}, 404)
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type",
                         CONTENT_TYPES.get(target.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    url = f"http://127.0.0.1:{port}"
    print("\n  \033[1;32mFreeTune\033[0m  -  free music, unblocked")
    print(f"  Open your browser at:  \033[4m{url}\033[0m")
    print("  Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bye!")
        server.shutdown()


if __name__ == "__main__":
    main()
