/* ============================================================
   NEXORA — js/media.js
   AudioPlayer, VideoPlayer, SYSTEM_STICKERS, svgEmoji.
   Импортирует: ./util.js
   ============================================================ */

import { escapeHtml, safeUrl, humanSize } from "./util.js";

/* ---------- SVG Emoji ---------- */
export function svgEmoji(e) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="72" text-anchor="middle" font-size="72">${e}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/* ---------- Системные стикеры ---------- */
export const SYSTEM_STICKERS = [
  { id: "sys-heart", name: "Heart", url: svgEmoji("❤️") },
  { id: "sys-fire", name: "Fire", url: svgEmoji("🔥") },
  { id: "sys-star", name: "Star", url: svgEmoji("⭐") },
  { id: "sys-thumb", name: "Thumb", url: svgEmoji("👍") },
  { id: "sys-cry", name: "Cry", url: svgEmoji("😭") },
  { id: "sys-laugh", name: "Laugh", url: svgEmoji("😂") },
  { id: "sys-cool", name: "Cool", url: svgEmoji("😎") },
  { id: "sys-party", name: "Party", url: svgEmoji("🥳") },
  { id: "sys-ghost", name: "Ghost", url: svgEmoji("👻") },
  { id: "sys-alien", name: "Alien", url: svgEmoji("👽") },
  { id: "sys-skull", name: "Skull", url: svgEmoji("💀") },
  { id: "sys-rocket", name: "Rocket", url: svgEmoji("🚀") },
];

/* ============================================================
   Audio Player Widget
   ============================================================ */
export class AudioPlayerWidget {
  constructor(url, { fileName = "", fileSize = 0, compact = false } = {}) {
    this.url = url;
    this.fileName = fileName;
    this.fileSize = fileSize;
    this.compact = compact;
    this.audio = null;
    this.el = null;
    this.bars = [];
  }

  _seedBars(count = 48) {
    let h = 0;
    for (let i = 0; i < this.url.length; i++) h = (h * 31 + this.url.charCodeAt(i)) | 0;
    const bars = [];
    let state = h || 1;
    for (let i = 0; i < count; i++) {
      state = (state * 1664525 + 1013904223) | 0;
      const v = ((state >>> 16) & 0x7fff) / 0x7fff;
      bars.push(0.25 + v * 0.75);
    }
    return bars;
  }

  render() {
    const el = document.createElement("div");
    el.className = "ap" + (this.compact ? " ap-compact" : "");
    el.innerHTML = `
      <button class="ap-play" type="button" aria-label="Play">
        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>
      </button>
      <div class="ap-body">
        <div class="ap-waveform"></div>
        <div class="ap-meta">
          <span class="ap-time">0:00</span>
          <span class="ap-sep">·</span>
          <span class="ap-dur">0:00</span>
          ${this.fileName ? `<span class="ap-sep">·</span><span class="ap-name">${escapeHtml(this.fileName)}</span>` : ""}
          ${this.fileSize ? `<span class="ap-sep">·</span><span class="ap-size">${escapeHtml(humanSize(this.fileSize))}</span>` : ""}
        </div>
      </div>
      <button class="ap-speed" type="button" aria-label="Speed">1x</button>
    `;
    this.el = el;
    this.audio = new Audio();
    this.audio.preload = "metadata";
    this.audio.src = this.url;

    const wf = el.querySelector(".ap-waveform");
    this.bars = this._seedBars(48);
    this.bars.forEach((v) => {
      const b = document.createElement("span");
      b.style.height = (v * 100) + "%";
      wf.appendChild(b);
    });

    const playBtn = el.querySelector(".ap-play");
    const speedBtn = el.querySelector(".ap-speed");
    const durEl = el.querySelector(".ap-dur");
    const timeEl = el.querySelector(".ap-time");

    const fmt = (s) => {
      if (!isFinite(s)) return "0:00";
      const m = Math.floor(s / 60);
      const ss = String(Math.floor(s % 60)).padStart(2, "0");
      return `${m}:${ss}`;
    };

    this.audio.addEventListener("loadedmetadata", () => {
      durEl.textContent = fmt(this.audio.duration);
    });
    this.audio.addEventListener("timeupdate", () => {
      timeEl.textContent = fmt(this.audio.currentTime);
      const pct = this.audio.duration ? this.audio.currentTime / this.audio.duration : 0;
      this._paint(pct);
    });
    this.audio.addEventListener("play", () => {
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    });
    this.audio.addEventListener("pause", () => {
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>';
    });
    this.audio.addEventListener("ended", () => {
      this.audio.currentTime = 0;
      this._paint(0);
      timeEl.textContent = "0:00";
    });

    playBtn.addEventListener("click", () => {
      if (this.audio.paused) this.audio.play().catch(() => {});
      else this.audio.pause();
    });
    speedBtn.addEventListener("click", () => {
      const rates = [1, 1.5, 2, 0.5];
      const idx = rates.indexOf(this.audio.playbackRate);
      const next = rates[(idx + 1) % rates.length];
      this.audio.playbackRate = next;
      speedBtn.textContent = next + "x";
    });
    wf.addEventListener("click", (e) => {
      const r = wf.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      if (this.audio.duration) {
        this.audio.currentTime = pct * this.audio.duration;
        this._paint(pct);
      }
    });
    return el;
  }

  _paint(pct) {
    if (!this.el) return;
    const wf = this.el.querySelector(".ap-waveform");
    const bars = wf.children;
    const active = Math.floor(bars.length * pct);
    for (let i = 0; i < bars.length; i++) {
      bars[i].classList.toggle("active", i < active);
    }
  }
}

/* ============================================================
   Video Player Widget
   ============================================================ */
export class VideoPlayerWidget {
  constructor(url, { fileName = "", fileSize = 0, poster = "" } = {}) {
    this.url = url;
    this.fileName = fileName;
    this.fileSize = fileSize;
    this.poster = poster;
    this.el = null;
    this.video = null;
  }

  render() {
    const el = document.createElement("div");
    el.className = "vp";
    el.innerHTML = `
      <video preload="metadata" playsinline ${this.poster ? `poster="${safeUrl(this.poster)}"` : ""}></video>
      <div class="vp-controls">
        <button class="vp-play" type="button" aria-label="Play">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>
        </button>
        <div class="vp-bar"><div class="vp-progress"></div></div>
        <span class="vp-time">0:00 / 0:00</span>
        <button class="vp-mute" type="button" aria-label="Mute">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        </button>
        <button class="vp-full" type="button" aria-label="Fullscreen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>
        <a class="vp-dl" href="${safeUrl(this.url)}" download="${escapeHtml(this.fileName || "video")}" target="_blank" rel="noopener noreferrer" aria-label="Download">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </a>
      </div>
    `;
    this.el = el;
    this.video = el.querySelector("video");
    this.video.src = this.url;

    const playBtn = el.querySelector(".vp-play");
    const muteBtn = el.querySelector(".vp-mute");
    const fullBtn = el.querySelector(".vp-full");
    const bar = el.querySelector(".vp-bar");
    const prog = el.querySelector(".vp-progress");
    const timeEl = el.querySelector(".vp-time");

    const fmt = (s) => {
      if (!isFinite(s)) return "0:00";
      const m = Math.floor(s / 60);
      const ss = String(Math.floor(s % 60)).padStart(2, "0");
      return `${m}:${ss}`;
    };

    this.video.addEventListener("loadedmetadata", () => {
      timeEl.textContent = `0:00 / ${fmt(this.video.duration)}`;
    });
    this.video.addEventListener("timeupdate", () => {
      const pct = this.video.duration ? (this.video.currentTime / this.video.duration) * 100 : 0;
      prog.style.width = pct + "%";
      timeEl.textContent = `${fmt(this.video.currentTime)} / ${fmt(this.video.duration)}`;
    });
    this.video.addEventListener("play", () => {
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    });
    this.video.addEventListener("pause", () => {
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>';
    });
    this.video.addEventListener("ended", () => {
      prog.style.width = "0%";
      timeEl.textContent = `0:00 / ${fmt(this.video.duration)}`;
    });
    playBtn.addEventListener("click", () => {
      if (this.video.paused) this.video.play().catch(() => {});
      else this.video.pause();
    });
    this.video.addEventListener("click", () => {
      if (this.video.paused) this.video.play().catch(() => {});
      else this.video.pause();
    });
    muteBtn.addEventListener("click", () => {
      this.video.muted = !this.video.muted;
      muteBtn.classList.toggle("muted", this.video.muted);
    });
    fullBtn.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (this.video.requestFullscreen) this.video.requestFullscreen();
      else if (this.video.webkitEnterFullscreen) this.video.webkitEnterFullscreen();
    });
    bar.addEventListener("click", (e) => {
      const r = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      if (this.video.duration) this.video.currentTime = pct * this.video.duration;
    });

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting && !this.video.paused) this.video.pause();
        });
      }, { threshold: 0.1 });
      setTimeout(() => io.observe(this.video), 100);
    }
    return el;
  }
}