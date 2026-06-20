"use strict";

// ----------------------------- state ------------------------------------- //
const state = {
  queue: [],          // current playing list
  index: -1,          // index into queue
  mode: "list",       // list | repeat | shuffle
  favs: loadFavs(),
  lrc: [],            // [{t, text, tr}]
  lrcIdx: -1,
};

const $ = (s) => document.querySelector(s);
const audio = $("#audio");

// ----------------------------- helpers ----------------------------------- //
function loadFavs() {
  try { return JSON.parse(localStorage.getItem("freetune_favs") || "[]"); }
  catch { return []; }
}
function saveFavs() {
  localStorage.setItem("freetune_favs", JSON.stringify(state.favs));
}
function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove("show"), 2200);
}
function trackKey(t) { return `${t.source}:${t.id}`; }
function isFav(t) { return state.favs.some((f) => trackKey(f) === trackKey(t)); }

// ----------------------------- API --------------------------------------- //
async function api(path, params) {
  const url = path + "?" + new URLSearchParams(params).toString();
  const r = await fetch(url);
  if (!r.ok) throw new Error("request failed " + r.status);
  return r.json();
}

async function doSearch(name) {
  const source = $("#source").value;
  $("#results").innerHTML = '<div class="loading">搜索中… searching</div>';
  $("#empty").style.display = "none";
  $("#list-title").textContent = `搜索结果 · “${name}”`;
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

// ----------------------------- rendering ---------------------------------- //
function coverUrl(t, size) {
  if (!t.pic_id) return placeholderCover();
  return `/api/pic?source=${encodeURIComponent(t.source)}&id=${encodeURIComponent(t.pic_id)}&size=${size || 120}`;
}
function placeholderCover() {
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='#1b231d'/><text x='50%' y='54%' font-size='28' text-anchor='middle' fill='#2f4036'>♪</text></svg>`
  );
}

// pic endpoint returns JSON {url}; resolve lazily into <img>
async function fillCover(img, t, size) {
  img.src = placeholderCover();
  if (!t.pic_id) return;
  try {
    const d = await api("/api/pic", { source: t.source, id: t.pic_id, size: size || 120 });
    if (d.url) img.src = d.url;
  } catch {}
}

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
      <div class="t-actions">
        <button class="act-fav" title="收藏">${isFav(t) ? "💚" : "🤍"}</button>
      </div>`;
    const img = row.querySelector(".t-cover");
    fillCover(img, t, 120);
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

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function highlightPlaying() {
  document.querySelectorAll(".track").forEach((el) => el.classList.remove("playing"));
  const cur = state.queue[state.index];
  if (!cur) return;
  document.querySelectorAll(`.track[data-key="${trackKey(cur)}"]`)
    .forEach((el) => el.classList.add("playing"));
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

  $("#bar-title").textContent = t.name;
  $("#bar-artist").textContent = "加载中… " + t.artist;
  $("#lp-title").textContent = t.name;
  $("#lp-artist").textContent = t.artist;
  fillCover($("#bar-cover"), t, 300);
  fillCover($("#lp-cover"), t, 500);
  $("#fav-btn").textContent = isFav(t) ? "💚" : "🤍";
  highlightPlaying();
  loadLyrics(t);

  // Stream through our backend (handles fallback + CORS + range)
  const streamUrl = "/stream?" + new URLSearchParams({
    source: t.source, id: t.id, br,
    name: t.name, artist: t.artist,
  }).toString();

  audio.src = streamUrl;
  try {
    await audio.play();
    $("#bar-artist").textContent = t.artist;
  } catch (e) {
    $("#bar-artist").textContent = t.artist;
  }
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
  if (state.mode === "shuffle") {
    state.index = Math.floor(Math.random() * state.queue.length);
  } else {
    state.index = (state.index + 1) % state.queue.length;
  }
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
audio.addEventListener("play", () => { $("#play").textContent = "⏸"; $("#lp-cover").classList.add("spin"); });
audio.addEventListener("pause", () => { $("#play").textContent = "▶"; $("#lp-cover").classList.remove("spin"); });

audio.addEventListener("timeupdate", () => {
  const d = audio.duration || 0;
  $("#cur").textContent = fmt(audio.currentTime);
  $("#dur").textContent = fmt(d);
  const pct = d ? (audio.currentTime / d) * 1000 : 0;
  const seek = $("#seek");
  seek.value = pct;
  seek.style.backgroundSize = (pct / 10) + "% 100%";
  syncLyric(audio.currentTime);
});

$("#seek").addEventListener("input", (e) => {
  if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration;
});

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
  $("#lyrics").innerHTML = '<div class="lrc-line">加载歌词…</div>';
  try {
    const d = await api("/api/lyric", { source: t.source, id: t.lyric_id || t.id });
    const main = parseLrc(d.lyric);
    const tr = parseLrc(d.tlyric);
    if (tr.length) {
      main.forEach((l) => {
        const match = tr.find((x) => Math.abs(x.t - l.t) < 0.5);
        if (match) l.tr = match.text;
      });
    }
    state.lrc = main;
    renderLyrics();
  } catch {
    $("#lyrics").innerHTML = '<div class="lrc-line">暂无歌词</div>';
  }
}

function renderLyrics() {
  const box = $("#lyrics");
  if (!state.lrc.length) { box.innerHTML = '<div class="lrc-line">纯音乐 / 暂无歌词</div>'; return; }
  box.innerHTML = state.lrc.map((l, i) =>
    `<div class="lrc-line" data-i="${i}">${escapeHtml(l.text)}${l.tr ? `<div class="lrc-tr">${escapeHtml(l.tr)}</div>` : ""}</div>`
  ).join("");
}

function syncLyric(time) {
  if (!state.lrc.length) return;
  let idx = -1;
  for (let i = 0; i < state.lrc.length; i++) {
    if (state.lrc[i].t <= time + 0.25) idx = i; else break;
  }
  if (idx === state.lrcIdx) return;
  state.lrcIdx = idx;
  const lines = $("#lyrics").querySelectorAll(".lrc-line");
  lines.forEach((el) => el.classList.remove("active"));
  const active = $(`#lyrics .lrc-line[data-i="${idx}"]`);
  if (active) {
    active.classList.add("active");
    active.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

// ----------------------------- favorites & queue -------------------------- //
function toggleFav(t) {
  if (isFav(t)) state.favs = state.favs.filter((f) => trackKey(f) !== trackKey(t));
  else { state.favs.unshift(t); toast(`已收藏「${t.name}」`); }
  saveFavs();
  renderFavs();
  const cur = state.queue[state.index];
  if (cur && trackKey(cur) === trackKey(t)) $("#fav-btn").textContent = isFav(t) ? "💚" : "🤍";
}
function renderFavs() {
  const box = $("#favs-list");
  if (!state.favs.length) { box.innerHTML = '<div class="empty">还没有收藏，点歌曲右侧的 🤍</div>'; return; }
  renderList(box, state.favs);
}
function renderQueue() {
  const box = $("#queue-list");
  if (!state.queue.length) { box.innerHTML = '<div class="empty">播放列表为空</div>'; return; }
  renderList(box, state.queue);
  highlightPlaying();
}

// ----------------------------- UI wiring ---------------------------------- //
$("#search-btn").addEventListener("click", () => {
  const v = $("#q").value.trim();
  if (v) doSearch(v);
});
$("#q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const v = e.target.value.trim(); if (v) doSearch(v); }
});

$("#play").addEventListener("click", togglePlay);
$("#next").addEventListener("click", next);
$("#prev").addEventListener("click", prev);
$("#mode").addEventListener("click", (e) => {
  const order = ["list", "repeat", "shuffle"];
  state.mode = order[(order.indexOf(state.mode) + 1) % order.length];
  e.target.textContent = { list: "🔁", repeat: "🔂", shuffle: "🔀" }[state.mode];
  toast({ list: "顺序播放", repeat: "单曲循环", shuffle: "随机播放" }[state.mode]);
});
$("#fav-btn").addEventListener("click", () => {
  const t = state.queue[state.index];
  if (t) toggleFav(t);
});

$("#vol").addEventListener("input", (e) => { audio.volume = e.target.value / 100; });
audio.volume = 0.9;

$("#lyric-toggle").addEventListener("click", () => {
  const p = $("#lyric-panel");
  p.style.display = (p.style.display === "none") ? "flex" : "none";
});

// nav switching
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    $("#view-" + btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "favs") renderFavs();
    if (btn.dataset.view === "queue") renderQueue();
  });
});

// keyboard
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "ArrowRight") next();
  if (e.code === "ArrowLeft") prev();
});

// initial hint
renderFavs();
$("#empty").style.display = "block";
