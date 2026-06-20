"use strict";

// ----------------------------- icons (SF-symbol-like) --------------------- //
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M7 6h2.2v12H7zM20 6l-9 6 9 6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M14.8 6H17v12h-2.2zM4 6l9 6-9 6z"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.3l-1.45-1.32C5.4 14.36 2 11.28 2 7.5 2 4.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 4.42 22 7.5c0 3.78-3.4 6.86-8.55 11.54L12 20.3z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  heartFill: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.7-4.35-9.33-7.5C.9 11.27 1 8.5 3 6.8 4.7 5.4 7 5.7 8.4 7.2L12 11l3.6-3.8C17 5.7 19.3 5.4 21 6.8c2 1.7 2.1 4.47.33 6.7C18.7 16.65 12 21 12 21z"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/></svg>',
  repeat1: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/><text x="12" y="15.5" font-size="8" font-weight="700" text-anchor="middle" fill="currentColor">1</text></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M10.6 9.2L5.4 4 4 5.4l5.2 5.2zM14.5 4l2 2L4 18.6 5.4 20 18 7.5l2 2V4zm.3 9.4l-1.4 1.4 3.1 3.2L14.5 20H20v-5.5l-2 2z"/></svg>',
  queue: '<svg viewBox="0 0 24 24"><path d="M3 5h18v2H3zm0 6h12v2H3zm0 6h12v2H3zm15-4l4 3-4 3z"/></svg>',
};

// ----------------------------- state ------------------------------------- //
const state = {
  queue: [], index: -1,
  mode: "list",          // list | shuffle | repeat
  favs: loadFavs(),
  lrc: [], lrcIdx: -1,
  playToken: 0, playStage: null,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const audio = $("#audio");

// ----------------------------- helpers ----------------------------------- //
function loadFavs() {
  try { return JSON.parse(localStorage.getItem("freetune_favs") || "[]"); }
  catch { return []; }
}
function saveFavs() { localStorage.setItem("freetune_favs", JSON.stringify(state.favs)); }
function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove("show"), 2200);
}
function trackKey(t) { return `${t.source}:${t.id}`; }
function isFav(t) { return state.favs.some((f) => trackKey(f) === trackKey(t)); }
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ----------------------------- API --------------------------------------- //
async function api(path, params) {
  const r = await fetch(path + "?" + new URLSearchParams(params).toString());
  if (!r.ok) throw new Error("request failed " + r.status);
  return r.json();
}

async function doSearch(name) {
  const source = $("#source").value;
  $("#search-empty").classList.remove("show");
  $("#results").innerHTML = '<div class="loading">搜索中…</div>';
  try {
    const list = await api("/api/search", { name, source, count: 40, page: 1 });
    if (!list.length) {
      $("#results").innerHTML = "";
      const e = $("#search-empty"); e.classList.add("show");
      e.querySelector("div:last-child").textContent = "没有结果，换个关键词或音乐源";
      return;
    }
    renderList($("#results"), list);
  } catch (e) {
    $("#results").innerHTML = `<div class="loading">出错了：${escapeHtml(e.message)}</div>`;
  }
}

// ----------------------------- covers ------------------------------------- //
function placeholderCover() {
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='#2c2c2e'/><text x='50%' y='56%' font-size='26' text-anchor='middle' fill='#555'>♪</text></svg>`);
}
async function fillCover(imgs, t, size) {
  const list = Array.isArray(imgs) ? imgs : [imgs];
  list.forEach((im) => { if (im) im.src = placeholderCover(); });
  if (!t.pic_id) return;
  try {
    const d = await api("/api/pic", { source: t.source, id: t.pic_id, size: size || 120 });
    if (d.url) list.forEach((im) => { if (im) im.src = d.url; });
  } catch {}
}

// ----------------------------- list rendering ----------------------------- //
function renderList(container, list) {
  container.innerHTML = "";
  list.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.key = trackKey(t);
    row.innerHTML = `
      <img class="row-art" />
      <div class="row-text">
        <div class="row-title">${escapeHtml(t.name)}</div>
        <div class="row-sub">${escapeHtml(t.artist)}${t.album ? " · " + escapeHtml(t.album) : ""}</div>
      </div>
      <button class="row-fav ${isFav(t) ? "on" : ""}" aria-label="收藏">${isFav(t) ? ICON.heartFill : ICON.heart}</button>`;
    fillCover(row.querySelector(".row-art"), t, 120);
    row.addEventListener("click", (e) => {
      if (e.target.closest(".row-fav")) return;
      playFromList(list, i);
    });
    row.querySelector(".row-fav").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(t);
      const b = e.currentTarget;
      b.classList.toggle("on", isFav(t));
      b.innerHTML = isFav(t) ? ICON.heartFill : ICON.heart;
    });
    container.appendChild(row);
  });
  highlightPlaying();
}

function highlightPlaying() {
  const cur = state.queue[state.index];
  $$(".row").forEach((el) => el.classList.toggle("playing", cur && el.dataset.key === trackKey(cur)));
}

// ----------------------------- playback ----------------------------------- //
function proxyStreamUrl(t, br) {
  return "/stream?" + new URLSearchParams({
    source: t.source, id: t.id, br, name: t.name, artist: t.artist,
  }).toString();
}

function playFromList(list, i) {
  state.queue = list.slice();
  state.index = i;
  renderQueue();
  playCurrent();
  if (window.matchMedia("(max-width:720px)").matches) openNP();
}

async function playCurrent() {
  const t = state.queue[state.index];
  if (!t) return;
  const br = $("#quality").value;
  const token = ++state.playToken;

  $("#mini").hidden = false;
  setText(["#mini-title", "#np-title"], t.name);
  setText(["#mini-artist", "#np-artist"], t.artist);
  fillCover([$("#mini-art"), $("#np-art")], t, 600);
  setFavIcons(isFav(t));
  highlightPlaying();
  loadLyrics(t);
  updateMediaSession(t);

  // Hybrid: prefer direct CDN URL (listener's IP), fall back to proxy.
  let directUrl = "";
  try {
    const d = await api("/api/url", { source: t.source, id: t.id, br, name: t.name, artist: t.artist });
    if (d && d.ok && d.url) directUrl = d.url;
  } catch {}
  if (token !== state.playToken) return;

  const pageHttps = location.protocol === "https:";
  const directUsable = directUrl && !(pageHttps && directUrl.startsWith("http:"));
  if (directUsable) { state.playStage = "direct"; audio.src = directUrl; }
  else { state.playStage = "proxy"; audio.src = proxyStreamUrl(t, br); }

  try { await audio.play(); } catch {}
}

audio.addEventListener("error", () => {
  const t = state.queue[state.index];
  if (!t) return;
  if (state.playStage === "direct") {
    state.playStage = "proxy";
    audio.src = proxyStreamUrl(t, $("#quality").value);
    audio.play().catch(() => {});
    return;
  }
  toast(`「${t.name}」暂无可用音源，已跳过`);
  setTimeout(next, 600);
});

function togglePlay() {
  if (!state.queue.length) return;
  if (audio.paused) audio.play(); else audio.pause();
}
function next() {
  if (!state.queue.length) return;
  state.index = state.mode === "shuffle"
    ? Math.floor(Math.random() * state.queue.length)
    : (state.index + 1) % state.queue.length;
  playCurrent();
}
function prev() {
  if (!state.queue.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  state.index = (state.index - 1 + state.queue.length) % state.queue.length;
  playCurrent();
}

audio.addEventListener("ended", () => {
  if (state.mode === "repeat") { audio.currentTime = 0; audio.play(); }
  else next();
});

function setPlayIcons(playing) {
  $("#mini-play").innerHTML = playing ? ICON.pause : ICON.play;
  $("#np-play").innerHTML = playing ? ICON.pause : ICON.play;
  $("#np").classList.toggle("playing", playing);
}
audio.addEventListener("play", () => setPlayIcons(true));
audio.addEventListener("pause", () => setPlayIcons(false));

audio.addEventListener("timeupdate", () => {
  const d = audio.duration || 0;
  const pct = d ? (audio.currentTime / d) * 1000 : 0;
  $("#np-cur").textContent = fmt(audio.currentTime);
  $("#np-dur").textContent = "-" + fmt(d - audio.currentTime);
  const seek = $("#np-seek");
  if (!seek._dragging) { seek.value = pct; seek.style.backgroundSize = (pct / 10) + "% 100%"; }
  $("#mini-progress").style.width = (pct / 10) + "%";
  syncLyric(audio.currentTime);
});

(() => {
  const el = $("#np-seek");
  el.addEventListener("input", (e) => {
    el._dragging = true;
    el.style.backgroundSize = (e.target.value / 10) + "% 100%";
    if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration;
  });
  el.addEventListener("change", () => { el._dragging = false; });
})();

// ----------------------------- lyrics ------------------------------------- //
function parseLrc(raw) {
  const out = [];
  if (!raw) return out;
  for (const line of raw.split("\n")) {
    const tags = [...line.matchAll(/\[(\d+):(\d+)(?:\.(\d+))?\]/g)];
    const text = line.replace(/\[[^\]]*\]/g, "").trim();
    if (!tags.length || !text) continue;
    for (const m of tags) {
      const t = (+m[1]) * 60 + (+m[2]) + (m[3] ? +("0." + m[3]) : 0);
      out.push({ t, text, tr: "" });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
async function loadLyrics(t) {
  state.lrc = []; state.lrcIdx = -1;
  $("#np-lyrics").innerHTML = '<div class="lrc-line">加载歌词…</div>';
  try {
    const d = await api("/api/lyric", { source: t.source, id: t.lyric_id || t.id });
    const main = parseLrc(d.lyric), tr = parseLrc(d.tlyric);
    if (tr.length) main.forEach((l) => {
      const m = tr.find((x) => Math.abs(x.t - l.t) < 0.5); if (m) l.tr = m.text;
    });
    state.lrc = main;
    renderLyrics();
  } catch { $("#np-lyrics").innerHTML = '<div class="lrc-line">暂无歌词</div>'; }
}
function renderLyrics() {
  const box = $("#np-lyrics");
  box.innerHTML = state.lrc.length
    ? state.lrc.map((l, i) => `<div class="lrc-line" data-i="${i}">${escapeHtml(l.text)}${l.tr ? `<div class="lrc-tr">${escapeHtml(l.tr)}</div>` : ""}</div>`).join("")
    : '<div class="lrc-line">纯音乐 / 暂无歌词</div>';
}
function syncLyric(time) {
  if (!state.lrc.length) return;
  let idx = -1;
  for (let i = 0; i < state.lrc.length; i++) { if (state.lrc[i].t <= time + 0.25) idx = i; else break; }
  if (idx === state.lrcIdx) return;
  state.lrcIdx = idx;
  const box = $("#np-lyrics");
  box.querySelectorAll(".lrc-line").forEach((el) => el.classList.remove("active"));
  const active = box.querySelector(`.lrc-line[data-i="${idx}"]`);
  if (active && $("#np").classList.contains("open")) {
    active.classList.add("active");
    active.scrollIntoView({ block: "center", behavior: "smooth" });
  } else if (active) { active.classList.add("active"); }
}

// ----------------------------- favorites & queue -------------------------- //
function setText(sels, txt) { sels.forEach((s) => { const el = $(s); if (el) el.textContent = txt; }); }
function setFavIcons(on) {
  const np = $("#np-fav");
  np.classList.toggle("on", on);
  np.innerHTML = on ? ICON.heartFill : ICON.heart;
}
function toggleFav(t) {
  if (isFav(t)) state.favs = state.favs.filter((f) => trackKey(f) !== trackKey(t));
  else { state.favs.unshift(t); toast(`已添加到资料库`); }
  saveFavs();
  renderFavs();
  const cur = state.queue[state.index];
  if (cur && trackKey(cur) === trackKey(t)) setFavIcons(isFav(t));
}
function renderFavs() {
  const box = $("#favs-list");
  if (!state.favs.length) { box.innerHTML = ""; $("#favs-empty").classList.add("show"); return; }
  $("#favs-empty").classList.remove("show");
  renderList(box, state.favs);
}
function renderQueue() {
  const box = $("#queue-list");
  if (!state.queue.length) { box.innerHTML = ""; $("#queue-empty").classList.add("show"); return; }
  $("#queue-empty").classList.remove("show");
  renderList(box, state.queue);
}

// ----------------------------- views / tabs ------------------------------- //
function switchView(view) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#view-" + view).classList.add("active");
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  if (view === "library") renderFavs();
  if (view === "queue") renderQueue();
  $(".screen").scrollTop = 0;
}
$$(".tab").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));

// ----------------------------- Now Playing -------------------------------- //
function openNP() { if (state.queue.length) $("#np").classList.add("open"); }
function closeNP() { $("#np").classList.remove("open"); }
$("#mini").addEventListener("click", (e) => { if (e.target.closest(".mini-btn")) return; openNP(); });
$("#np-close").addEventListener("click", closeNP);
$("#np-queue-btn").addEventListener("click", () => { closeNP(); switchView("queue"); });

// swipe down to close
(() => {
  const np = $("#np"); let y0 = null;
  np.addEventListener("touchstart", (e) => { y0 = np.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  np.addEventListener("touchmove", (e) => {
    if (y0 === null) return;
    if (e.touches[0].clientY - y0 > 80) { closeNP(); y0 = null; }
  }, { passive: true });
})();

// ----------------------------- controls ----------------------------------- //
$("#mini-play").innerHTML = ICON.play;
$("#mini-next").innerHTML = ICON.next;
$("#np-play").innerHTML = ICON.play;
$("#np-prev").innerHTML = ICON.prev;
$("#np-next").innerHTML = ICON.next;
$("#np-mode").innerHTML = ICON.repeat;
$("#np-queue-btn").innerHTML = ICON.queue;
$("#np-fav").innerHTML = ICON.heart;

["#mini-play", "#np-play"].forEach((s) => $(s).addEventListener("click", (e) => { e.stopPropagation(); togglePlay(); }));
["#mini-next", "#np-next"].forEach((s) => $(s).addEventListener("click", (e) => { e.stopPropagation(); next(); }));
$("#np-prev").addEventListener("click", prev);
$("#np-fav").addEventListener("click", () => { const t = state.queue[state.index]; if (t) toggleFav(t); });

$("#np-mode").addEventListener("click", () => {
  const order = ["list", "shuffle", "repeat"];
  state.mode = order[(order.indexOf(state.mode) + 1) % order.length];
  const btn = $("#np-mode");
  btn.innerHTML = { list: ICON.repeat, shuffle: ICON.shuffle, repeat: ICON.repeat1 }[state.mode];
  btn.classList.toggle("active", state.mode !== "list");
  toast({ list: "顺序播放", shuffle: "随机播放", repeat: "单曲循环" }[state.mode]);
});

// search input
const qInput = $("#q");
qInput.addEventListener("input", () => $(".search-field").classList.toggle("has-text", !!qInput.value));
qInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const v = qInput.value.trim(); if (v) { doSearch(v); qInput.blur(); } }
});
$("#q-clear").addEventListener("click", () => {
  qInput.value = ""; $(".search-field").classList.remove("has-text"); qInput.focus();
});

// keyboard (desktop)
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "ArrowRight") next();
  if (e.code === "ArrowLeft") prev();
});

// Media Session (iOS lock screen)
if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("nexttrack", next);
  navigator.mediaSession.setActionHandler("previoustrack", prev);
}
async function updateMediaSession(t) {
  if (!("mediaSession" in navigator)) return;
  let artwork = [];
  if (t.pic_id) {
    try {
      const d = await api("/api/pic", { source: t.source, id: t.pic_id, size: 500 });
      if (d.url) artwork = [{ src: d.url, sizes: "500x500", type: "image/jpeg" }];
    } catch {}
  }
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.name, artist: t.artist, album: t.album || "FreeTune", artwork,
    });
  } catch {}
}

// init
renderFavs();
$("#search-empty").classList.add("show");
