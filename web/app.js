"use strict";

// ----------------------------- state ------------------------------------- //
const state = {
  queue: [],
  index: -1,
  mode: "list",          // list | repeat | shuffle
  favs: loadFavs(),
  lrc: [],
  lrcIdx: -1,
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
  $("#results").innerHTML = '<div class="loading">搜索中… searching</div>';
  $("#empty").style.display = "none";
  $("#list-title").textContent = `搜索结果 · “${name}”`;
  switchView("search");
  try {
    const list = await api("/api/search", { name, source, count: 40, page: 1 });
    if (!list.length) {
      $("#results").innerHTML = "";
      $("#empty").style.display = "block";
      $("#empty").textContent = "没有结果，换个关键词或音乐源试试 😶";
      return;
    }
    renderList($("#results"), list);
  } catch (e) {
    $("#results").innerHTML = `<div class="empty">出错了：${e.message}</div>`;
  }
}

// ----------------------------- covers ------------------------------------- //
function placeholderCover() {
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='#1b231d'/><text x='50%' y='54%' font-size='28' text-anchor='middle' fill='#2f4036'>♪</text></svg>`);
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

// ----------------------------- rendering ---------------------------------- //
function renderList(container, list) {
  container.innerHTML = "";
  list.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "track";
    row.dataset.key = trackKey(t);
    row.innerHTML = `
      <div class="t-idx">${i + 1}</div>
      <img class="t-cover" />
      <div class="t-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
      <div class="t-artist" title="${escapeHtml(t.artist)}">${escapeHtml(t.artist)}</div>
      <div class="t-src">${escapeHtml(t.source)}</div>
      <div class="t-actions"><button class="act-fav" aria-label="收藏">${isFav(t) ? "💚" : "🤍"}</button></div>`;
    fillCover(row.querySelector(".t-cover"), t, 120);
    row.addEventListener("click", (e) => {
      if (e.target.closest(".act-fav")) return;
      playFromList(list, i);
    });
    row.querySelector(".act-fav").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(t);
      e.target.textContent = isFav(t) ? "💚" : "🤍";
    });
    container.appendChild(row);
  });
}

function highlightPlaying() {
  $$(".track").forEach((el) => el.classList.remove("playing"));
  const cur = state.queue[state.index];
  if (!cur) return;
  $$(`.track[data-key="${trackKey(cur)}"]`).forEach((el) => el.classList.add("playing"));
}

// ----------------------------- playback ----------------------------------- //
function playFromList(list, i) {
  state.queue = list.slice();
  state.index = i;
  renderQueue();
  playCurrent();
}

async function playCurrent() {
  const t = state.queue[state.index];
  if (!t) return;
  const br = $("#quality").value;

  setText(["#bar-title", "#lp-title", "#np-title"], t.name);
  setText(["#lp-artist", "#np-artist"], t.artist);
  $("#bar-artist").textContent = "加载中… " + t.artist;
  fillCover([$("#bar-cover"), $("#lp-cover"), $("#np-cover")], t, 500);
  setFavIcons(isFav(t));
  highlightPlaying();
  loadLyrics(t);
  updateMediaSession(t);

  audio.src = "/stream?" + new URLSearchParams({
    source: t.source, id: t.id, br, name: t.name, artist: t.artist,
  }).toString();
  try { await audio.play(); } catch {}
  $("#bar-artist").textContent = t.artist;
}

function setText(sels, txt) { sels.forEach((s) => { const el = $(s); if (el) el.textContent = txt; }); }
function setFavIcons(on) {
  $("#fav-btn").textContent = on ? "💚" : "🤍";
  $("#np-fav").textContent = on ? "💚" : "🤍";
}

audio.addEventListener("error", () => {
  const t = state.queue[state.index];
  if (t) toast(`「${t.name}」暂无可用音源，已跳过`);
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
  state.index = (state.index - 1 + state.queue.length) % state.queue.length;
  playCurrent();
}

audio.addEventListener("ended", () => {
  if (state.mode === "repeat") { audio.currentTime = 0; audio.play(); }
  else next();
});
function setPlayIcons(playing) {
  const ic = playing ? "⏸" : "▶";
  ["#play", "#bar-play", "#np-play"].forEach((s) => { const el = $(s); if (el) el.textContent = ic; });
  $("#lp-cover").classList.toggle("spin", playing);
}
audio.addEventListener("play", () => setPlayIcons(true));
audio.addEventListener("pause", () => setPlayIcons(false));

audio.addEventListener("timeupdate", () => {
  const d = audio.duration || 0;
  const pct = d ? (audio.currentTime / d) * 1000 : 0;
  setText(["#cur", "#np-cur"], fmt(audio.currentTime));
  setText(["#dur", "#np-dur"], fmt(d));
  ["#seek", "#np-seek"].forEach((s) => {
    const el = $(s); if (!el || el._dragging) return;
    el.value = pct; el.style.backgroundSize = (pct / 10) + "% 100%";
  });
  syncLyric(audio.currentTime);
});

function wireSeek(sel) {
  const el = $(sel);
  el.addEventListener("input", (e) => {
    el._dragging = true;
    if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration;
  });
  el.addEventListener("change", () => { el._dragging = false; });
}
wireSeek("#seek"); wireSeek("#np-seek");

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
  $$(".lyrics").forEach((b) => b.innerHTML = '<div class="lrc-line">加载歌词…</div>');
  try {
    const d = await api("/api/lyric", { source: t.source, id: t.lyric_id || t.id });
    const main = parseLrc(d.lyric);
    const tr = parseLrc(d.tlyric);
    if (tr.length) main.forEach((l) => {
      const m = tr.find((x) => Math.abs(x.t - l.t) < 0.5);
      if (m) l.tr = m.text;
    });
    state.lrc = main;
    renderLyrics();
  } catch {
    $$(".lyrics").forEach((b) => b.innerHTML = '<div class="lrc-line">暂无歌词</div>');
  }
}
function renderLyrics() {
  const html = state.lrc.length
    ? state.lrc.map((l, i) => `<div class="lrc-line" data-i="${i}">${escapeHtml(l.text)}${l.tr ? `<div class="lrc-tr">${escapeHtml(l.tr)}</div>` : ""}</div>`).join("")
    : '<div class="lrc-line">纯音乐 / 暂无歌词</div>';
  $$(".lyrics").forEach((b) => b.innerHTML = html);
}
function syncLyric(time) {
  if (!state.lrc.length) return;
  let idx = -1;
  for (let i = 0; i < state.lrc.length; i++) {
    if (state.lrc[i].t <= time + 0.25) idx = i; else break;
  }
  if (idx === state.lrcIdx) return;
  state.lrcIdx = idx;
  $$(".lyrics").forEach((box) => {
    box.querySelectorAll(".lrc-line").forEach((el) => el.classList.remove("active"));
    const active = box.querySelector(`.lrc-line[data-i="${idx}"]`);
    if (active) {
      active.classList.add("active");
      active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
}

// ----------------------------- favorites & queue -------------------------- //
function toggleFav(t) {
  if (isFav(t)) state.favs = state.favs.filter((f) => trackKey(f) !== trackKey(t));
  else { state.favs.unshift(t); toast(`已收藏「${t.name}」`); }
  saveFavs();
  renderFavs();
  const cur = state.queue[state.index];
  if (cur && trackKey(cur) === trackKey(t)) setFavIcons(isFav(t));
}
function renderFavs() {
  const box = $("#favs-list");
  if (!state.favs.length) { box.innerHTML = '<div class="empty">还没有收藏，点歌曲旁的 🤍</div>'; return; }
  renderList(box, state.favs);
}
function renderQueue() {
  const box = $("#queue-list");
  if (!state.queue.length) { box.innerHTML = '<div class="empty">播放列表为空</div>'; return; }
  renderList(box, state.queue);
  highlightPlaying();
}

// ----------------------------- views / nav -------------------------------- //
function switchView(view) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#view-" + view).classList.add("active");
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  if (view === "favs") renderFavs();
  if (view === "queue") renderQueue();
}
$$(".nav-item, .tab").forEach((btn) =>
  btn.addEventListener("click", () => switchView(btn.dataset.view)));

// ----------------------------- now playing sheet -------------------------- //
function openNP() { if (state.queue.length) $("#np").classList.add("open"); }
function closeNP() { $("#np").classList.remove("open"); }
$("#bar-open").addEventListener("click", () => { if (window.matchMedia("(max-width:760px)").matches) openNP(); });
$("#np-close").addEventListener("click", closeNP);
$("#np-list").addEventListener("click", () => { closeNP(); switchView("queue"); });

// swipe-down to close the sheet
(() => {
  const np = $("#np"); let y0 = null;
  np.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  np.addEventListener("touchmove", (e) => {
    if (y0 === null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 90 && np.scrollTop <= 0) { closeNP(); y0 = null; }
  }, { passive: true });
})();

// ----------------------------- controls wiring ---------------------------- //
["#play", "#bar-play", "#np-play"].forEach((s) => $(s).addEventListener("click", togglePlay));
["#next", "#bar-next", "#np-next"].forEach((s) => $(s).addEventListener("click", next));
["#prev", "#bar-prev", "#np-prev"].forEach((s) => $(s).addEventListener("click", prev));

function cycleMode() {
  const order = ["list", "repeat", "shuffle"];
  state.mode = order[(order.indexOf(state.mode) + 1) % order.length];
  const ic = { list: "🔁", repeat: "🔂", shuffle: "🔀" }[state.mode];
  ["#mode", "#np-mode"].forEach((s) => { const el = $(s); if (el) el.textContent = ic; });
  toast({ list: "顺序播放", repeat: "单曲循环", shuffle: "随机播放" }[state.mode]);
}
["#mode", "#np-mode"].forEach((s) => $(s).addEventListener("click", cycleMode));

["#fav-btn", "#np-fav"].forEach((s) => $(s).addEventListener("click", () => {
  const t = state.queue[state.index]; if (t) toggleFav(t);
}));

$("#search-btn").addEventListener("click", () => { const v = $("#q").value.trim(); if (v) doSearch(v); });
$("#q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const v = e.target.value.trim(); if (v) { doSearch(v); e.target.blur(); } }
});

$("#vol").addEventListener("input", (e) => { audio.volume = e.target.value / 100; });
audio.volume = 0.9;

$("#lyric-toggle").addEventListener("click", () => {
  const p = $("#lyric-panel");
  p.style.display = (p.style.display === "none") ? "flex" : "none";
});

// keyboard (desktop)
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "ArrowRight") next();
  if (e.code === "ArrowLeft") prev();
});

// Media Session (lock screen / control center on iOS)
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
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.name, artist: t.artist, album: t.album || "FreeTune", artwork,
  });
}

// init
renderFavs();
$("#empty").style.display = "block";
