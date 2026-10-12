/* ============================================================
   NEXORA — js/util.js
   Утилиты: DOM, escape, format, markdown, toast, localStorage.
   НЕ импортирует ничего из проекта (нижний слой).
   ============================================================ */

import { currentLocale } from "./i18n-locale.js"; // см. ниже

/* ---------- DOM ---------- */
export const $ = (id) => document.getElementById(id);
export const $$ = (sel) => document.querySelectorAll(sel);

/* ---------- Escape ---------- */
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- URL sanitize ---------- */
export function safeUrl(u) {
  if (!u) return "";
  const s = String(u).trim();
  if (!/^https?:\/\//i.test(s)) return "";
  return s.replace(/"/g, "%22");
}

/* ---------- Локаль / форматы ---------- */
function _locale() {
  const l = currentLocale();
  return l === "ru" ? "ru-RU"
    : l === "uk" ? "uk-UA"
    : l === "kk" ? "kk-KZ"
    : l === "de" ? "de-DE"
    : l === "zh" ? "zh-CN"
    : "en-US";
}

export function formatTime(iso) {
  try {
    const d = new Date(iso), now = new Date();
    const loc = _locale();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    }
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) {
      return "Вчера " + d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString(loc, { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

export function formatDateLabel(iso) {
  const d = new Date(iso), now = new Date();
  const loc = _locale();
  if (d.toDateString() === now.toDateString()) return "Сегодня";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString(_locale(), {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function humanSize(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

/* ---------- Markdown ---------- */
export function renderMarkdown(raw) {
  let tt = escapeHtml(raw);
  tt = tt.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  tt = tt.replace(/\*\*([^\n*]+?)\*\*/g, "<strong>$1</strong>");
  tt = tt.replace(/(^|[^*])\*([^\n*]+?)\*(?!\*)/g, "$1<em>$2</em>");
  tt = tt.replace(/~~([^\n~]+?)~~/g, "<del>$1</del>");
  tt = tt.replace(/(^|\n)&gt;\s?(.+)/g, "$1<blockquote>$2</blockquote>");
  tt = tt.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    const safe = safeUrl(url);
    if (!safe) return label;
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
  });
  const parts = [];
  let last = 0;
  const re = /<a [^>]*>.*?<\/a>/g;
  let m;
  while ((m = re.exec(tt)) !== null) {
    parts.push(_autolink(tt.slice(last, m.index)));
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  parts.push(_autolink(tt.slice(last)));
  return parts.join("").replace(/\n/g, "<br>");
}

function _autolink(seg) {
  return seg.replace(/(^|[\s>])((?:https?:\/\/)[^\s<]+)/g, (_, p, url) => {
    const safe = safeUrl(url);
    if (!safe) return p + url;
    return `${p}<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`;
  });
}

/* ---------- Toast ---------- */
export function toast(message, kind = "info", title = null) {
  const c = $("toast-container");
  if (!c) return;
  const titles = { success: "Готово", error: "Ошибка", warning: "Внимание", info: "Инфо" };
  const icons = { success: "✓", error: "✕", warning: "!", info: "i" };
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `
    <div class="toast-icon">${icons[kind] || "i"}</div>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title || titles[kind])}</div>
      <div class="toast-msg">${escapeHtml(message)}</div>
    </div>`;
  c.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

/* ---------- LocalStorage ---------- */
export function lsGet(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export function lsSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (_) {}
}

export function pushRecent(key, value, max = 24) {
  const list = lsGet(key, []);
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1);
  list.unshift(value);
  lsSet(key, list.slice(0, max));
}

/* ---------- Статусы пользователя ---------- */
export const STATUS_META = {
  online:    { label: "В сети",        color: "#3ddc84", symbol: "" },
  dnd:       { label: "Не беспокоить", color: "#ff5a6e", symbol: "🌙" },
  busy:      { label: "Занят",         color: "#ffb547", symbol: "⛔" },
  invisible: { label: "Невидимка",     color: "#5a5a70", symbol: "⚫" },
};