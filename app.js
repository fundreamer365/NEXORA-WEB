/* ============================================================
   NEXORA v8.1 — единый app.js
   ============================================================ */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { t, setLocale, currentLocale, applyTranslations, LOCALES } from "./i18n.js";
import {
  PROFILE_THEMES, CHAT_THEME_ACCENTS,
  applyProfileTheme, getProfileTheme, applyChatTheme, resetChatTheme,
} from "./themes.js";

/* ============================================================
   CONFIG
   ============================================================ */
const SUPABASE_URL = "https://jylukilnkgkvmjnierqy.supabase.co";
const SUPABASE_KEY = "sb_publishable_U5rKld1LYukIaFZecnYNaA_cgaJZu4R";

const VIRTUAL_DOMAIN = "nexora.local";
const AVATAR_BUCKET = "avatars";
const ATTACH_BUCKET = "attachments";
const STICKER_BUCKET = "stickers";
const AVATAR_MAX = 2 * 1024 * 1024;
const COVER_MAX = 4 * 1024 * 1024;
const ATTACH_MAX = 50 * 1024 * 1024;
const STICKER_MAX = 2 * 1024 * 1024;
const POLL_MS = 2500;
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "😮", "😢"];
const TYPING_TIMEOUT_MS = 3000;
const ACCOUNTS_KEY = "nexora-accounts";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "nexora-auth" },
});

/* ============================================================
   UTIL
   ============================================================ */
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeUrl(u) {
  if (!u) return "";
  const s = String(u).trim();
  if (!/^https?:\/\//i.test(s)) return "";
  return s.replace(/"/g, "%22");
}
function formatTime(iso) {
  try {
    const d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString())
      return "Вчера " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { day: "2-digit", month: "short" });
  } catch { return ""; }
}
function formatDateLabel(iso) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return "Сегодня";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}
function formatDateTime(iso) {
  try { return new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
function humanSize(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

function renderMarkdown(raw) {
  let tt = escapeHtml(raw);
  tt = tt.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  tt = tt.replace(/\*\*([^\n*]+?)\*\*/g, "<strong>$1</strong>");
  tt = tt.replace(/(^|[^*])\*([^\n*]+?)\*(?!\*)/g, "$1<em>$2</em>");
  tt = tt.replace(/~~([^\n~]+?)~~/g, "<del>$1</del>");
  tt = tt.replace(/(^|\n)&gt;\s?(.+)/g, "$1<blockquote>$2</blockquote>");
  tt = tt.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    const safe = safeUrl(url); if (!safe) return label;
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
  });
  const parts = []; let last = 0;
  const re = /<a [^>]*>.*?<\/a>/g; let m;
  while ((m = re.exec(tt)) !== null) {
    parts.push(autolink(tt.slice(last, m.index)));
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  parts.push(autolink(tt.slice(last)));
  return parts.join("").replace(/\n/g, "<br>");
}
function autolink(seg) {
  return seg.replace(/(^|[\s>])((?:https?:\/\/)[^\s<]+)/g, (_, p, url) => {
    const safe = safeUrl(url); if (!safe) return p + url;
    return `${p}<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`;
  });
}

function toast(message, kind = "info", title = null) {
  const c = $("toast-container");
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
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }, 3200);
}

function avatarHTML(user, size = "md") {
  const name = (user?.username || "?").trim();
  const initial = name ? name[0].toUpperCase() : "?";
  const cls = `avatar avatar-${size}`;
  const online = user?.is_online && user?.show_online !== false && !user?.is_bot;
  const onlineCls = online ? " online-glow" : "";
  if (user?.avatar_url) {
    const safe = safeUrl(user.avatar_url);
    if (safe) return `<div class="avatar-wrap"><div class="${cls}${onlineCls}" style="background-image:url('${safe}')"></div>${online ? '<span class="online-dot"></span>' : ""}</div>`;
  }
  return `<div class="avatar-wrap"><div class="${cls}${onlineCls}">${escapeHtml(initial)}</div>${online ? '<span class="online-dot"></span>' : ""}</div>`;
}
function paintAvatar(el, user) {
  if (!el) return;
  const name = (user?.username || "?").trim();
  if (user?.avatar_url) {
    const safe = safeUrl(user.avatar_url);
    if (safe) { el.style.backgroundImage = `url('${safe}')`; el.textContent = ""; return; }
  }
  el.style.backgroundImage = "";
  el.textContent = name ? name[0].toUpperCase() : "?";
}

const EMOJI = {
  Smileys: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😋","😜","🤪","🤔","🤨","😐","😴","😷","🤒","🥳","😎","🤓","😕","😟","😭","😱","😡"],
  Gestures: ["👋","🤚","✋","🖖","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎","✊","👊","👏","🙌","🤲","🤝","🙏","💪"],
  Hearts: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝"],
  Animals: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦"],
  Food: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🍒","🥝","🥑","🍔","🍟","🍕","🌭","🍜","🍣","🍱","🍦"],
  Objects: ["⌚","📱","💻","⌨️","🖥️","📷","📸","🎥","📞","📺","⏰","💡","🔦","💰","💳","🔑"],
  Symbols: ["🔥","⭐","🌟","✨","⚡","💥","💫","💦","💨","💬","✅","❌","❗","💯","🔔","🎵","🎶","♾️"],
};
const SYSTEM_STICKERS = [
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
  { id: "sys-cat", name: "Cat", url: svgEmoji("🐱") },
  { id: "sys-dog", name: "Dog", url: svgEmoji("🐶") },
  { id: "sys-unicorn", name: "Unicorn", url: svgEmoji("🦄") },
  { id: "sys-pizza", name: "Pizza", url: svgEmoji("🍕") },
];
function svgEmoji(e) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="72" text-anchor="middle" font-size="72">${e}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem("nexora-sound") !== "off";
  }
  _ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { return null; }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  unlock() {
    const ctx = this._ensure();
    if (!ctx) return;
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (_) {}
  }
  _tone(freqs, dur = 0.28, type = "sine", vol = 0.15, stagger = 0.06) {
    const ctx = this._ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    freqs.forEach((f, i) => {
      const t2 = now + i * stagger;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(f, t2);
      gain.gain.setValueAtTime(0.0001, t2);
      gain.gain.exponentialRampToValueAtTime(vol, t2 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t2 + dur);
      osc.start(t2); osc.stop(t2 + dur + 0.05);
    });
  }
  message() { this._tone([880, 1174], 0.3, "sine", 0.16, 0.08); }
  send()    { this._tone([1200], 0.12, "sine", 0.08, 0); }
  error()   { this._tone([440, 330], 0.35, "sawtooth", 0.10, 0.07); }
  success() { this._tone([523, 659, 784], 0.35, "sine", 0.12, 0.05); }
  click()   { this._tone([1500], 0.05, "square", 0.04, 0); }
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem("nexora-sound", this.enabled ? "on" : "off");
    if (this.enabled) this.success();
    return this.enabled;
  }
}
const Sounds = new SoundEngine();

const BOT_COMMANDS = {
  "/help": "Доступные команды:\n/newbot — создать своего бота\n/mybots — список моих ботов\n/time — текущее время\n/roll 6 — случайное число от 1 до N\n/echo текст — вернуть текст\n/ping — pong",
  "/ping": "pong 🏓",
  "/time": () => `Сейчас ${new Date().toLocaleString()}`,
  "/roll": (args) => {
    const n = Math.max(1, Math.min(1_000_000, parseInt(args[0] || "6", 10) || 6));
    return `🎲 ${Math.floor(Math.random() * n) + 1} (из ${n})`;
  },
  "/echo": (args) => args.join(" ") || "(пусто)",
  "/newbot": () => "Открываю мастер создания бота…",
  "/mybots": () => "Открываю список ботов…",
};

/* ============================================================
   КЛАСС NEXORA
   ============================================================ */
class NEXORA {
  constructor() {
    this.user = null;
    this.profile = null;
    this.chats = [];
    this.contacts = [];
    this.activeTab = "chats";
    this.activeChat = null;
    this.activePeer = null;
    this.messages = [];
    this.members = [];
    this.reactions = {};
    this.reads = {};
    this.readsByOther = {};
    this.polls = {};
    this.typingUsers = {};
    this.pendingAttachment = null;
    this.pendingReplyTo = null;
    this.realtimeChannel = null;
    this.typingChannel = null;
    this.pollsChannel = null;
    this.notificationChatId = null;
    this.pollTimer = null;
    this.presenceTimer = null;
    this.typingSelfTimeout = null;
    this.searchTimeout = null;
    this.messageSearchQuery = "";
    this.theme = {};
    this.virtualWindow = 60;
    this.visibleStart = 0;
    this._activeBotCommands = [];
    this._swRegistration = null;
    this._openModal = null;
    this._escHandler = null;
    this._recorder = null;
    this._chunks = [];
    this._voiceTimer = null;

    this.bindGlobalEvents();
  }

  emailFromUsername(u) { return `${u.trim().toLowerCase()}@${VIRTUAL_DOMAIN}`; }
  showScreen(id) {
    $$(".screen").forEach(s => s.classList.remove("active"));
    $(id).classList.add("active");
  }
  isPeerOnline(chat) {
    if (!chat?.peer) return false;
    if (chat.peer.is_bot) return false;
    return !!(chat.peer.is_online && chat.peer.show_online !== false);
  }

  /* ============================================================
     MODALS
     ============================================================ */
  openModal({ title, body, footer, narrow = false, wide = false }) {
    this.closeModal();
    const backdrop = document.createElement("div");
    backdrop.className = "nx-modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "nx-modal" + (narrow ? " nx-modal-narrow" : wide ? " nx-modal-wide" : "");
    const header = document.createElement("div");
    header.className = "nx-modal-header";
    header.innerHTML = `
      <div class="nx-modal-title">${escapeHtml(title || "")}</div>
      <button class="nx-modal-close" title="Закрыть">✕</button>`;
    const bodyEl = document.createElement("div");
    bodyEl.className = "nx-modal-body";
    modal.appendChild(header); modal.appendChild(bodyEl);
    if (footer) {
      const footerEl = document.createElement("div");
      footerEl.className = "nx-modal-footer";
      modal.appendChild(footerEl);
    }
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    header.querySelector(".nx-modal-close").addEventListener("click", () => this.closeModal());
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) this.closeModal(); });
    this._escHandler = (e) => { if (e.key === "Escape") this.closeModal(); };
    document.addEventListener("keydown", this._escHandler);
    this._openModal = { backdrop, modal, bodyEl, footerEl: modal.querySelector(".nx-modal-footer") };
    if (typeof body === "function") body(bodyEl, this._openModal);
    else if (typeof body === "string") bodyEl.innerHTML = body;
    if (footer) {
      if (typeof footer === "function") footer(this._openModal.footerEl, this._openModal);
      else if (typeof footer === "string") this._openModal.footerEl.innerHTML = footer;
    }
    return this._openModal;
  }
  closeModal() {
    if (this._openModal) {
      try { this._openModal.backdrop.remove(); } catch (_) {}
      this._openModal = null;
    }
    if (this._escHandler) {
      document.removeEventListener("keydown", this._escHandler);
      this._escHandler = null;
    }
  }

  /* ============================================================
     ACCOUNTS
     ============================================================ */
  loadAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]"); }
    catch { return []; }
  }
  saveAccounts(list) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); }
  rememberAccount({ id, username, nexora_id, avatar_url }) {
    const list = this.loadAccounts().filter(a => a.id !== id);
    list.unshift({ id, username, nexora_id, avatar_url, added_at: Date.now() });
    this.saveAccounts(list.slice(0, 8));
  }
  forgetAccount(id) {
    this.saveAccounts(this.loadAccounts().filter(a => a.id !== id));
  }
  openAccountsSwitcher() {
    const accounts = this.loadAccounts();
    this.openModal({
      title: "Аккаунты",
      narrow: true,
      body: (body) => {
        body.innerHTML = "";
        if (!accounts.length) {
          body.innerHTML = `<p class="muted">Нет сохранённых аккаунтов</p>`;
        }
        accounts.forEach(a => {
          const row = document.createElement("div");
          row.className = "account-row" + (a.id === this.user?.id ? " current" : "");
          row.innerHTML = `
            ${avatarHTML(a, "md")}
            <div class="account-info">
              <div class="account-name">${escapeHtml(a.username)}</div>
              <div class="account-id">${escapeHtml(a.nexora_id || "")}</div>
            </div>
            ${a.id === this.user?.id ? '<span class="account-badge">Активен</span>' : ""}`;
          if (a.id !== this.user?.id) {
            row.addEventListener("click", async () => {
              this.closeModal();
              await this.switchAccount(a.id);
            });
            const rm = document.createElement("button");
            rm.className = "btn btn-ghost";
            rm.style.marginLeft = "6px";
            rm.textContent = "✕";
            rm.addEventListener("click", (e) => {
              e.stopPropagation();
              this.forgetAccount(a.id);
              this.openAccountsSwitcher();
            });
            row.appendChild(rm);
          }
          body.appendChild(row);
        });
        const add = document.createElement("button");
        add.className = "btn btn-primary btn-block";
        add.style.marginTop = "14px";
        add.textContent = "＋ Войти в другой аккаунт";
        add.addEventListener("click", async () => {
          if (this.user && this.profile) {
            this.rememberAccount({
              id: this.user.id, username: this.profile.username,
              nexora_id: this.profile.nexora_id, avatar_url: this.profile.avatar_url,
            });
          }
          this.closeModal();
          await this.logout(true);
        });
        body.appendChild(add);
      },
    });
  }
  async switchAccount(accountId) {
    if (!confirm("Переключиться на этот аккаунт?")) return;
    if (this.user && this.profile) {
      this.rememberAccount({
        id: this.user.id, username: this.profile.username,
        nexora_id: this.profile.nexora_id, avatar_url: this.profile.avatar_url,
      });
    }
    try { await this.setOnline(false); } catch (_) {}
    await supabase.auth.signOut();
    this.stopRealtime();
    this.stopPresence();
    this.user = null; this.profile = null;
    this.activeChat = null; this.messages = [];
    this.chats = []; this.contacts = [];
    this.showScreen("screen-auth");
    this.showAuthCard("login");
    const acc = this.loadAccounts().find(a => a.id === accountId);
    if (acc) {
      $("login-username").value = acc.username;
      $("login-password").focus();
      toast(`Введи пароль для @${acc.username}`, "info");
    }
  }

  /* ============================================================
     BOOT
     ============================================================ */
  async boot() {
    applyProfileTheme(getProfileTheme());
    this.registerServiceWorker();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        this.user = session.user;
        await this.loadProfile();
        if (this.profile) {
          this.rememberAccount({
            id: this.user.id, username: this.profile.username,
            nexora_id: this.profile.nexora_id, avatar_url: this.profile.avatar_url,
          });
          try {
            await supabase.rpc("log_login_event", {
              user_agent: navigator.userAgent || "", ip: null,
            });
          } catch (_) {}
          return this.enterApp();
        }
      }
    } catch (e) { console.error(e); }
    this.showScreen("screen-auth");
    this.showAuthCard("login");
  }
  async registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try { this._swRegistration = await navigator.serviceWorker.register("./sw.js"); }
    catch (e) { console.warn("SW:", e); }
  }
  async requestNotificationPermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const res = await Notification.requestPermission();
    return res === "granted";
  }
  async notify(title, body, tag = "nexora") {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const opts = { body, icon: "assets/icon-192.png", badge: "assets/icon-192.png", tag };
    try {
      if (navigator.serviceWorker?.controller) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, opts);
      } else {
        new Notification(title, opts);
      }
    } catch (e) { console.warn("notify:", e); }
  }

  /* ============================================================
     AUTH
     ============================================================ */
  showAuthCard(which) {
    ["login", "register", "mfa"].forEach(k => {
      $("auth-" + k).classList.toggle("hidden", k !== which);
    });
    this.clearAuthErrors();
  }
  clearAuthErrors() {
    ["login-error", "reg-error", "mfa-error"].forEach(id => {
      const el = $(id); if (el) { el.textContent = ""; el.classList.remove("show"); }
    });
  }
  showError(id, msg) {
    const el = $(id); if (!el) return;
    el.textContent = msg; el.classList.add("show");
    Sounds.error();
  }
  validateUsername(u) {
    if (!u) return "Введи nickname";
    if (u.length < 3 || u.length > 24) return "3–24 символа";
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return "Только латиница, цифры, _";
    return null;
  }
  async doRegister() {
    this.clearAuthErrors();
    const u = $("reg-username").value.trim();
    const p1 = $("reg-password").value;
    const p2 = $("reg-password2").value;
    const uErr = this.validateUsername(u);
    if (uErr) return this.showError("reg-error", uErr);
    if (p1.length < 8) return this.showError("reg-error", "Пароль минимум 8 символов");
    if (p1 !== p2) return this.showError("reg-error", "Пароли не совпадают");
    const btn = $("btn-register");
    btn.disabled = true; btn.textContent = "Создаём…";
    try {
      const { data, error } = await supabase.auth.signUp({
        email: this.emailFromUsername(u), password: p1,
        options: { data: { username: u.toLowerCase() } },
      });
      if (error) throw error;
      if (data.user?.identities?.length === 0) throw new Error("Такой nickname уже занят");
      toast("Аккаунт создан. Входим…", "success");
      Sounds.success();
      await this.doLogin(u, p1, true);
    } catch (e) {
      this.showError("reg-error", e.message || "Ошибка регистрации");
    } finally {
      btn.disabled = false; btn.textContent = "Create account";
    }
  }
  async doLogin(username, password, silent = false) {
    if (!silent) this.clearAuthErrors();
    const u = username ?? $("login-username").value.trim();
    const p = password ?? $("login-password").value;
    if (!u || !p) {
      if (!silent) this.showError("login-error", "Введи nickname и пароль");
      return;
    }
    const btn = $("btn-login");
    if (!silent) { btn.disabled = true; btn.textContent = "Входим…"; }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: this.emailFromUsername(u), password: p,
      });
      if (error) throw error;
      this.user = data.user;
      try {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const hasTotp = (factors?.totp || []).some(f => f.status === "verified");
        if (hasTotp) {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
            this.showScreen("screen-auth");
            this.showAuthCard("mfa");
            return;
          }
        }
      } catch (_) {}
      await this.loadProfile();
      if (this.profile) {
        this.rememberAccount({
          id: this.user.id, username: this.profile.username,
          nexora_id: this.profile.nexora_id, avatar_url: this.profile.avatar_url,
        });
      }
      try {
        await supabase.rpc("log_login_event", {
          user_agent: navigator.userAgent || "", ip: null,
        });
      } catch (_) {}
      toast("Добро пожаловать!", "success");
      Sounds.success();
      this.enterApp();
    } catch (e) {
      const msg = /invalid/i.test(e.message || "") ? "Неверный логин или пароль" : (e.message || "Ошибка входа");
      if (!silent) this.showError("login-error", msg);
      else throw e;
    } finally {
      if (!silent) { btn.disabled = false; btn.textContent = "Sign in"; }
    }
  }
  async doMfaVerify() {
    this.clearAuthErrors();
    const code = $("mfa-code").value.trim();
    if (!/^\d{6}$/.test(code)) return this.showError("mfa-error", "Введи 6 цифр");
    const btn = $("btn-mfa");
    btn.disabled = true; btn.textContent = "Проверяем…";
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = (factors?.totp || []).find(f => f.status === "verified");
      if (!totp) throw new Error("TOTP-фактор не найден");
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (cErr) throw cErr;
      const { error } = await supabase.auth.mfa.verify({
        factorId: totp.id, challengeId: ch.id, code,
      });
      if (error) throw error;
      await this.loadProfile();
      if (this.profile) {
        this.rememberAccount({
          id: this.user.id, username: this.profile.username,
          nexora_id: this.profile.nexora_id, avatar_url: this.profile.avatar_url,
        });
      }
      try {
        await supabase.rpc("log_login_event", {
          user_agent: navigator.userAgent || "", ip: null,
        });
      } catch (_) {}
      toast("Проверено", "success");
      Sounds.success();
      this.enterApp();
    } catch (e) {
      this.showError("mfa-error", e.message || "Неверный код");
    } finally {
      btn.disabled = false; btn.textContent = "Verify";
    }
  }
  async logout(silent = false) {
    if (!silent && !confirm("Выйти из NEXORA?")) return;
    try { await this.setOnline(false); } catch (_) {}
    if (this.user && this.profile && !silent) {
      this.rememberAccount({
        id: this.user.id, username: this.profile.username,
        nexora_id: this.profile.nexora_id, avatar_url: this.profile.avatar_url,
      });
    }
    await supabase.auth.signOut();
    this.stopRealtime();
    this.stopPresence();
    this.user = null; this.profile = null;
    this.activeChat = null; this.messages = [];
    this.chats = []; this.contacts = [];
    this.showScreen("screen-auth");
    this.showAuthCard("login");
  }

  /* ============================================================
     PROFILE / PRESENCE
     ============================================================ */
  async loadProfile() {
    if (!this.user) return;
    const { data, error } = await supabase
      .from("profiles").select("*").eq("id", this.user.id).single();
    if (error) { console.error("loadProfile:", error); return; }
    this.profile = data;
  }
  async updateProfile(patch) {
    const { data, error } = await supabase
      .from("profiles").update(patch).eq("id", this.user.id).select().single();
    if (error) throw error;
    this.profile = data;
    return data;
  }
  async setOnline(online) {
    if (!this.user) return;
    try {
      await supabase.from("profiles").update({
        is_online: online, last_seen: new Date().toISOString(),
      }).eq("id", this.user.id);
    } catch (_) {}
  }
  startPresence() {
    this.setOnline(true);
    this.presenceTimer = setInterval(() => this.setOnline(true), 60_000);
    window.addEventListener("beforeunload", () => {
      supabase.from("profiles").update({ is_online: false }).eq("id", this.user.id);
    });
    document.addEventListener("visibilitychange", () => {
      this.setOnline(!document.hidden).catch(() => {});
    });
  }
  stopPresence() {
    if (this.presenceTimer) { clearInterval(this.presenceTimer); this.presenceTimer = null; }
  }

  /* ============================================================
     ENTER APP
     ============================================================ */
  async enterApp() {
    this.showScreen("screen-app");
    document.documentElement.setAttribute("lang", currentLocale());
    applyTranslations();
    applyProfileTheme(getProfileTheme());
    this.renderSidebarFooter();
    this.startPresence();
    this.requestNotificationPermission();
    try { await supabase.rpc("get_or_create_saved_chat"); } catch (_) {}
    try {
      const { data } = await supabase.rpc("get_or_create_notification_chat");
      this.notificationChatId = data;
    } catch (_) {}
    await this.refreshChats();
    await this.refreshContacts();
    await this.loadReads();
    await this.loadReadsByOther();
    await this.loadChatThemes();
    this.subscribeProfiles();
    this.subscribeGlobalMessages();
    this.setupUnreadTitleUpdater();
    $("chat-view").classList.add("hidden");
    $("welcome").classList.remove("hidden");
    this.updatePageTitle();
    this.handleDeepLink();
  }
  renderSidebarFooter() {
    const me = this.profile;
    $("me-name").textContent = me.username;
    $("me-id").textContent = me.nexora_id;
    paintAvatar($("me-avatar"), me);
  }

  /* ============================================================
     UNREAD + READ RECEIPTS
     ============================================================ */
  async loadReads() {
    try {
      const { data } = await supabase.from("chat_reads")
        .select("chat_id, last_read_at").eq("user_id", this.user.id);
      const map = {};
      (data || []).forEach(r => { map[r.chat_id] = r.last_read_at; });
      this.reads = map;
    } catch (e) { this.reads = {}; }
  }
  async loadReadsByOther() {
    try {
      const { data: mem } = await supabase.from("chat_members")
        .select("chat_id").eq("user_id", this.user.id);
      const ids = (mem || []).map(m => m.chat_id);
      if (!ids.length) { this.readsByOther = {}; return; }
      const { data } = await supabase.from("chat_reads")
        .select("chat_id, user_id, last_read_at")
        .in("chat_id", ids)
        .neq("user_id", this.user.id);
      const map = {};
      (data || []).forEach(r => {
        if (!map[r.chat_id]) map[r.chat_id] = {};
        if (!map[r.chat_id][r.user_id] || new Date(r.last_read_at) > new Date(map[r.chat_id][r.user_id])) {
          map[r.chat_id][r.user_id] = r.last_read_at;
        }
      });
      this.readsByOther = map;
    } catch (_) { this.readsByOther = {}; }
  }
  isMessageRead(m) {
    if (!this.activeChat) return false;
    if (this.activeChat.type === "saved") return false;
    if (this.activeChat.type === "direct") {
      const peer = this.activeChat.peer;
      if (!peer) return false;
      const peerRead = this.readsByOther?.[this.activeChat.id]?.[peer.id];
      if (!peerRead) return false;
      return new Date(peerRead) >= new Date(m.created_at);
    }
    const map = this.readsByOther?.[this.activeChat.id] || {};
    const times = Object.values(map);
    if (!times.length) return false;
    const latest = times.reduce((a, b) => new Date(a) > new Date(b) ? a : b);
    return new Date(latest) >= new Date(m.created_at);
  }
  async markChatRead(chatId) {
    const iso = new Date().toISOString();
    this.reads[chatId] = iso;
    try {
      await supabase.from("chat_reads").upsert({
        user_id: this.user.id, chat_id: chatId, last_read_at: iso, updated_at: iso,
      });
    } catch (_) {}
    this.updatePageTitle();
  }
  unreadCountFor(chat) {
    const lastRead = this.reads[chat.id];
    const last = chat.last_message;
    if (!last) return 0;
    if (chat.type === "saved") return 0;
    if (chat.is_notification) return 0;
    if (!lastRead) return last.is_own ? 0 : 1;
    if (last.is_own) return 0;
    return new Date(last.created_at) > new Date(lastRead) ? 1 : 0;
  }
  totalUnread() {
    return this.chats.reduce((n, c) => n + this.unreadCountFor(c), 0);
  }
  updatePageTitle() {
    const n = this.totalUnread();
    document.title = n > 0 ? `(${n}) NEXORA — Connect without limits` : "NEXORA — Connect without limits";
  }
  setupUnreadTitleUpdater() {
    setInterval(() => this.updatePageTitle(), 5000);
  }

  /* ============================================================
     SIDEBAR
     ============================================================ */
  setTab(tab) {
    this.activeTab = tab;
    Sounds.click();
    $$(".tab").forEach(t2 => t2.classList.toggle("active", t2.dataset.tab === tab));
    this.renderSidebarList();
  }
  renderSidebarList() {
    const list = $("sidebar-list");
    list.innerHTML = "";
    if (this.activeTab === "chats") return this.renderChatsList(list);
    if (this.activeTab === "contacts") return this.renderContactsList(list);
  }
  renderChatsList(container) {
    if (!this.chats.length) {
      container.innerHTML = `<div class="empty-state">Пока нет чатов.<br>Найди пользователя по NEXORA ID, ник или @канал, или нажми ＋.</div>`;
      return;
    }
    this.chats.forEach(chat => {
      const div = document.createElement("div");
      div.className = "list-item" + (this.activeChat?.id === chat.id ? " active" : "");
      if (chat.type === "saved") div.dataset.saved = "1";
      if (chat.is_notification) div.dataset.notif = "1";
      const peer = chat.peer || {};
      let title;
      if (chat.is_notification) title = "NEXORA";
      else if (chat.type === "saved") title = "Избранное";
      else title = peer.nickname || chat.display_title || peer.username || chat.title || "Chat";
      const last = chat.last_message;
      const unread = this.unreadCountFor(chat);
      let sub = chat.type === "saved" ? "Твои сохранённые сообщения" :
                chat.is_notification ? "Уведомления о входах" : "Нет сообщений";
      if (last) {
        const icon = { image: "🖼️ ", video: "🎬 ", file: "📎 ", sticker: "🎨 ",
                       voice: "🎤 ", gif: "🎞️ ", poll: "📊 ", auth: "🔐 " }[last.kind] || "";
        sub = (last.is_own ? "Ты: " : "") + icon + (last.content || "").slice(0, 60);
      }
      const typing = this.typingUsers[chat.id];
      const typers = typing ? Object.values(typing).filter(tt => Date.now() - tt.ts < TYPING_TIMEOUT_MS) : [];
      if (typers.length) sub = `<em>${escapeHtml(typers.map(tt => tt.name).join(", "))} печатает…</em>`;
      let badge = "";
      if (chat.is_notification) badge = "📩 ";
      else if (chat.type === "channel") badge = "📢 ";
      else if (chat.type === "group") badge = "👥 ";
      else if (chat.type === "saved") badge = "⭐ ";
      const botBadge = peer.is_bot ? ' <span class="bot-badge">[BOT]</span>' : "";
      const avatarUser = chat.type === "saved" && !chat.is_notification
        ? { username: "★" }
        : chat.is_notification ? { username: "N" } : peer;
      let chanTag = "";
      if ((chat.type === "channel" || chat.type === "group") && chat.username) {
        chanTag = `<span class="channel-badge ${chat.is_public ? "public" : "private"}">@${escapeHtml(chat.username)}</span>`;
      }
      let ephTag = "";
      if (chat.is_ephemeral) ephTag = `<span class="ephemeral-badge">⏳</span>`;
      div.innerHTML = `
        ${avatarHTML(avatarUser, "md")}
        <div class="list-item-body">
          <div class="list-item-title">
            <span>${escapeHtml(badge + title)}${botBadge}${chanTag}${ephTag}</span>
            <span class="time">${last ? formatTime(last.created_at) : ""}</span>
          </div>
          <div class="list-item-sub">${typers.length ? sub : escapeHtml(sub)}</div>
        </div>
        ${unread ? `<div class="list-item-badge">${unread}</div>` : ""}`;
      div.addEventListener("click", () => this.openChat(chat));
      div.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.openChatContextMenu(e, chat);
      });
      container.appendChild(div);
    });
  }
  openChatContextMenu(event, chat) {
    this.closeContextMenu();
    const menu = document.createElement("div");
    menu.className = "ctx-menu"; menu.id = "ctx-menu";
    const mk = (label, handler, danger = false) => {
      const b = document.createElement("button");
      b.textContent = label;
      if (danger) b.classList.add("danger");
      b.addEventListener("click", () => { this.closeContextMenu(); handler(); });
      menu.appendChild(b);
    };
    if (chat.is_notification) {
      mk("🎨 Тема чата", () => this.openChatThemePicker(chat));
    } else if (chat.type === "saved") {
      mk("🎨 Тема чата", () => this.openChatThemePicker(chat));
    } else {
      mk("✓ Отметить прочитанным", () => this.markChatRead(chat.id));
      if (chat.type === "direct" && chat.peer) {
        mk("👤 Открыть профиль", () => this.openUserProfile(chat.peer.id, chat.peer));
      }
      if ((chat.type === "channel" || chat.type === "group") &&
          (chat.my_role === "owner" || chat.my_role === "admin")) {
        mk(chat.type === "channel" ? "⚙ Настройки канала" : "⚙ Настройки группы",
          () => chat.type === "channel" ? this.openChannelSettings(chat) : this.openGroupSettings(chat));
        mk("🔗 Поделиться ссылкой", () => this.openChannelShare(chat));
      }
      mk("🎨 Тема чата", () => this.openChatThemePicker(chat));
      mk("🗑 Удалить для себя", () => this.hideChatForMe(chat), true);
    }
    document.body.appendChild(menu);
    const r = event.target.getBoundingClientRect();
    menu.style.left = Math.min(r.left, window.innerWidth - 220) + "px";
    menu.style.top = Math.min(r.bottom, window.innerHeight - 220) + "px";
    setTimeout(() => document.addEventListener("click", this.closeContextMenu, { once: true }), 0);
  }
  async hideChatForMe(chat) {
    if (chat.type === "saved" && !chat.is_notification) {
      toast("Чат «Избранное» нельзя удалить", "warning"); return;
    }
    if (chat.is_notification) {
      toast("Служебный чат NEXORA нельзя удалить", "warning"); return;
    }
    if (!confirm(`Удалить чат «${chat.display_title}» только у себя?`)) return;
    try {
      await supabase.from("chat_members")
        .update({ hidden_until: new Date().toISOString() })
        .eq("chat_id", chat.id).eq("user_id", this.user.id);
      toast("Чат удалён у тебя", "warning");
      Sounds.click();
      await this.refreshChats();
      if (this.activeChat?.id === chat.id) {
        this.activeChat = null;
        $("chat-view").classList.add("hidden");
        $("welcome").classList.remove("hidden");
      }
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  /* ============================================================
     CHAT THEMES
     ============================================================ */
  openChatThemePicker(chat) {
    const themes = Object.entries(CHAT_THEME_ACCENTS);
    this.openModal({
      title: "Тема чата",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">
            Акцент темы применяется только в этом чате и только для тебя.
          </p>
          <div class="theme-grid" id="chat-theme-grid"></div>
        `;
        const grid = body.querySelector("#chat-theme-grid");
        const currentAccent = this.theme[chat.id]?.accent || null;
        themes.forEach(([key, info]) => {
          const tile = document.createElement("div");
          tile.className = "theme-tile";
          const c = info.accent || "#7c5cff";
          tile.style.background = "#16161f";
          tile.innerHTML = `
            <div class="tt-dot" style="background:${c}"></div>
            <div class="tt-body" style="background:${c}">${escapeHtml(info.name)}</div>
          `;
          if ((currentAccent || null) === info.accent) tile.classList.add("active");
          tile.addEventListener("click", async () => {
            await this.saveChatTheme(chat.id, info.accent, this.theme[chat.id]?.wallpaper_url || null);
            grid.querySelectorAll(".theme-tile").forEach(x => x.classList.remove("active"));
            tile.classList.add("active");
            toast("Тема чата обновлена", "success");
            Sounds.success();
          });
          grid.appendChild(tile);
        });

        const wallSec = document.createElement("div");
        wallSec.className = "settings-section";
        wallSec.style.marginTop = "14px";
        wallSec.innerHTML = `<h3>Обои</h3>`;
        const wallInp = document.createElement("input");
        wallInp.placeholder = "https://example.com/wallpaper.jpg";
        wallInp.value = this.theme[chat.id]?.wallpaper_url || "";
        const wallSave = document.createElement("button");
        wallSave.className = "btn btn-primary";
        wallSave.style.marginTop = "8px";
        wallSave.textContent = "Применить обои";
        wallSave.addEventListener("click", async () => {
          const u = wallInp.value.trim();
          if (u && !safeUrl(u)) return toast("Ссылка должна начинаться с http(s)://", "warning");
          await this.saveChatTheme(chat.id, currentAccent, u || null);
          toast("Обои сохранены", "success");
          Sounds.success();
        });
        const wallClear = document.createElement("button");
        wallClear.className = "btn btn-ghost";
        wallClear.style.marginTop = "8px";
        wallClear.style.marginLeft = "8px";
        wallClear.textContent = "Убрать";
        wallClear.addEventListener("click", async () => {
          wallInp.value = "";
          await this.saveChatTheme(chat.id, currentAccent, null);
          toast("Обои убраны", "warning");
        });
        wallSec.appendChild(wallInp);
        wallSec.appendChild(wallSave);
        wallSec.appendChild(wallClear);
        body.appendChild(wallSec);
      },
    });
  }
  async saveChatTheme(chatId, accent, wallpaper) {
    try {
      await supabase.from("chat_themes").upsert({
        user_id: this.user.id, chat_id: chatId,
        accent: accent, wallpaper_url: wallpaper,
      });
      if (!this.theme[chatId]) this.theme[chatId] = {};
      this.theme[chatId].accent = accent;
      this.theme[chatId].wallpaper_url = wallpaper;
      if (this.activeChat?.id === chatId) this.applyChatThemeToUI(chatId);
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }
  async loadChatThemes() {
    try {
      const { data } = await supabase.from("chat_themes").select("*").eq("user_id", this.user.id);
      const map = {};
      (data || []).forEach(t2 => { map[t2.chat_id] = { accent: t2.accent, wallpaper_url: t2.wallpaper_url }; });
      this.theme = map;
    } catch (_) {}
  }
  applyChatThemeToUI(chatId) {
    const t2 = this.theme[chatId];
    const box = $("messages");
    if (!box) return;
    if (t2?.wallpaper_url) {
      box.style.backgroundImage = `url('${safeUrl(t2.wallpaper_url)}')`;
      box.style.backgroundSize = "cover";
      box.style.backgroundPosition = "center";
    } else {
      box.style.backgroundImage = "";
    }
    applyChatTheme(t2 || null);
  }

  /* ============================================================
     CONTACTS
     ============================================================ */
  renderContactsList(container) {
    if (!this.contacts.length) {
      container.innerHTML = `<div class="empty-state">Нет контактов.<br>Найди пользователя по NEXORA ID или нику.</div>`;
      return;
    }
    this.contacts.forEach(c => {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = `
        ${avatarHTML(c, "md")}
        <div class="list-item-body">
          <div class="list-item-title"><span>${escapeHtml(c.nickname || c.username)}</span></div>
          <div class="list-item-sub">${escapeHtml(c.nexora_id)}</div>
        </div>`;
      div.addEventListener("click", () => this.openUserProfile(c.id, c));
      container.appendChild(div);
    });
  }
  async refreshContacts() {
    try {
      const { data, error } = await supabase
        .from("contacts")
        .select("contact_id, profile:profiles!contacts_contact_id_fkey(*)")
        .eq("owner_id", this.user.id);
      if (error) throw error;
      let nickMap = {};
      try {
        const { data: nicks } = await supabase
          .from("contact_nicknames").select("contact_id, nickname").eq("owner_id", this.user.id);
        (nicks || []).forEach(n => { nickMap[n.contact_id] = n.nickname; });
      } catch (_) {}
      this.contacts = (data || []).map(r => {
        const p = r.profile;
        if (!p) return null;
        p.nickname = nickMap[p.id] || null;
        return p;
      }).filter(Boolean);
    } catch (e) {
      console.error("refreshContacts:", e);
      this.contacts = [];
    }
    if (this.activeTab === "contacts") this.renderSidebarList();
  }
  async addContact(contactId) {
    if (contactId === this.user.id) throw new Error("Нельзя добавить себя");
    const { error } = await supabase.from("contacts").insert({
      owner_id: this.user.id, contact_id: contactId,
    });
    if (error && error.code !== "23505") throw error;
  }

  /* ============================================================
     CHATS
     ============================================================ */
  async refreshChats() {
    try {
      const { data: mem } = await supabase
        .from("chat_members").select("chat_id, hidden_until").eq("user_id", this.user.id);
      const visible = (mem || []).filter(m => !m.hidden_until);
      const ids = visible.map(m => m.chat_id);
      if (!ids.length) {
        this.chats = [];
        if (this.activeTab === "chats") this.renderSidebarList();
        this.updatePageTitle();
        return;
      }
      const [{ data: chats }, { data: members }, { data: msgs }, { data: nicks }, { data: notifs }] = await Promise.all([
        supabase.from("chats").select("id, is_group, title, type, description, avatar_url, updated_at, owner_id, username, is_public, invite_token, is_ephemeral, expires_at").in("id", ids),
        supabase.from("chat_members").select("chat_id, user_id, role, profile:profiles!chat_members_user_id_fkey(id, username, nexora_id, avatar_url, is_online, show_online, is_bot)").in("chat_id", ids),
        supabase.from("messages").select("chat_id, content, kind, created_at, sender_id, pinned").in("chat_id", ids).order("created_at", { ascending: false }).limit(300),
        supabase.from("contact_nicknames").select("contact_id, nickname").eq("owner_id", this.user.id),
        supabase.from("notification_chats").select("chat_id").eq("user_id", this.user.id),
      ]);
      const lastBy = {};
      (msgs || []).forEach(m => { if (!lastBy[m.chat_id]) lastBy[m.chat_id] = m; });
      const nickMap = {};
      (nicks || []).forEach(n => { nickMap[n.contact_id] = n.nickname; });
      const notifIds = new Set((notifs || []).map(n => n.chat_id));
      this.chats = (chats || []).map(c => {
        const mems = (members || []).filter(m => m.chat_id === c.id);
        const other = mems.find(m => m.user_id !== this.user.id);
        const myMem = mems.find(m => m.user_id === this.user.id);
        const peer = other?.profile || null;
        if (peer && nickMap[peer.id]) peer.nickname = nickMap[peer.id];
        const last = lastBy[c.id];
        const ctype = c.type || (c.is_group ? "group" : "direct");
        let display;
        if (ctype === "saved" && notifIds.has(c.id)) display = "NEXORA";
        else if (ctype === "saved") display = "Избранное";
        else display = peer ? (peer.nickname || peer.username) : (c.title || "Chat");
        return {
          id: c.id, is_group: c.is_group, type: ctype,
          title: c.title, description: c.description,
          avatar_url: c.avatar_url, owner_id: c.owner_id,
          username: c.username, is_public: c.is_public, invite_token: c.invite_token,
          is_ephemeral: c.is_ephemeral, expires_at: c.expires_at,
          updated_at: c.updated_at, my_role: myMem?.role || "member",
          peer, display_title: display,
          members_count: mems.length,
          is_notification: notifIds.has(c.id),
          last_message: last ? {
            content: last.content || "", kind: last.kind || "text",
            created_at: last.created_at, is_own: last.sender_id === this.user.id,
          } : null,
        };
      }).sort((a, b) => {
        const rankA = a.is_notification ? 0 : a.type === "saved" ? 1 : 2;
        const rankB = b.is_notification ? 0 : b.type === "saved" ? 1 : 2;
        if (rankA !== rankB) return rankA - rankB;
        const ta = a.last_message?.created_at || a.updated_at || "";
        const tb = b.last_message?.created_at || b.updated_at || "";
        return new Date(tb) - new Date(ta);
      });
      if (this.activeTab === "chats") this.renderSidebarList();
      this.updatePageTitle();
    } catch (e) {
      console.error("refreshChats:", e);
      this.chats = [];
      if (this.activeTab === "chats") this.renderSidebarList();
    }
  }
  async openDirectChat(peer) {
    try {
      const { data, error } = await supabase.rpc("get_or_create_direct_chat", { other_user: peer.id });
      if (error) throw error;
      await supabase.from("chat_members")
        .update({ hidden_until: null }).eq("chat_id", data).eq("user_id", this.user.id);
      await this.refreshChats();
      const chat = this.chats.find(c => c.id === data) || {
        id: data, type: "direct", peer,
        display_title: peer.nickname || peer.username, members_count: 2,
      };
      this.openChat(chat);
    } catch (e) { console.error(e); toast("Не удалось открыть чат", "error"); }
  }
  async openChatById(chatId) {
    await this.refreshChats();
    const chat = this.chats.find(c => c.id === chatId);
    if (chat) this.openChat(chat);
  }
  async openSavedChat() {
    try {
      const { data, error } = await supabase.rpc("get_or_create_saved_chat");
      if (error) throw error;
      await this.refreshChats();
      let chat = this.chats.find(c => c.id === data);
      if (!chat) chat = { id: data, type: "saved", display_title: "Избранное", members_count: 1, my_role: "owner" };
      this.openChat(chat);
    } catch (e) { console.error(e); toast("Не удалось открыть Избранное", "error"); }
  }
  async openNotificationChat() {
    try {
      const { data, error } = await supabase.rpc("get_or_create_notification_chat");
      if (error) throw error;
      this.notificationChatId = data;
      await this.refreshChats();
      let chat = this.chats.find(c => c.id === data);
      if (!chat) chat = { id: data, type: "saved", is_notification: true, display_title: "NEXORA", members_count: 1, my_role: "owner" };
      this.openChat(chat);
    } catch (e) { toast("Не удалось открыть уведомления", "error"); }
  }
  async openChat(chat) {
    this.activeChat = chat;
    this.activePeer = chat.peer || null;
    this.pendingReplyTo = null;
    Sounds.click();
    $("welcome").classList.add("hidden");
    $("chat-view").classList.remove("hidden");
    const ctype = chat.type || "direct";
    let badge = "";
    if (chat.is_notification) badge = "📩 ";
    else if (ctype === "channel") badge = "📢 ";
    else if (ctype === "group") badge = "👥 ";
    else if (ctype === "saved") badge = "⭐ ";
    const botTag = chat.peer?.is_bot ? ' <span class="bot-badge">[BOT]</span>' : "";
    let title;
    if (chat.is_notification) title = "NEXORA";
    else if (ctype === "saved") title = "Избранное";
    else title = chat.peer?.nickname || chat.display_title;
    let chanTag = "";
    if ((ctype === "channel" || ctype === "group") && chat.username) {
      chanTag = `<span class="channel-badge ${chat.is_public ? "public" : "private"}">@${escapeHtml(chat.username)}</span>`;
    }
    let ephTag = "";
    if (chat.is_ephemeral && chat.expires_at) {
      const left = Math.max(0, Math.floor((new Date(chat.expires_at) - new Date()) / 60000));
      ephTag = `<span class="ephemeral-badge">⏳ ${left} мин</span>`;
    }
    $("chat-peer-name").innerHTML = `${escapeHtml(badge + title)}${botTag}${chanTag}${ephTag}
      <span class="online-dot${this.isPeerOnline(chat) ? " online" : ""}"></span>`;
    if (chat.is_notification) $("chat-peer-sub").textContent = "Уведомления о входах в аккаунт";
    else if (ctype === "saved") $("chat-peer-sub").textContent = "Твои сохранённые сообщения";
    else if (ctype === "channel") $("chat-peer-sub").textContent = `${chat.is_public ? "публичный" : "приватный"} канал · ${chat.members_count || 0} подписчиков`;
    else if (ctype === "group") $("chat-peer-sub").textContent = `${chat.is_public ? "публичная" : "приватная"} группа · ${chat.members_count || 0} участников`;
    else $("chat-peer-sub").textContent = chat.peer?.nexora_id || (chat.members_count ? `${chat.members_count} участников` : "");
    paintAvatar($("chat-peer-avatar"), chat.type === "saved" && !chat.is_notification
      ? { username: "★" }
      : chat.is_notification ? { username: "N" }
      : (chat.peer || { username: chat.display_title }));
    const blocked = ctype === "channel" && !["owner", "admin"].includes(chat.my_role);
    $("composer").disabled = blocked;
    $("btn-send").disabled = blocked;
    $("btn-attach").disabled = blocked;
    $("btn-emoji").disabled = blocked;
    $("btn-poll").disabled = blocked;
    $("btn-voice").disabled = blocked;
    $("composer").placeholder = blocked ? t("onlyAdmins") : t("writeMessage");
    if (window.innerWidth <= 768) $("sidebar").classList.add("hidden-mobile");
    await this.loadChatThemes();
    this.applyChatThemeToUI(chat.id);
    this.stopRealtime();
    await this.loadMembers();
    await this.loadMessages();
    await this.loadReactions();
    await this.loadPolls();
    this._activeBotCommands = [];
    if (chat.peer?.is_bot) {
      try {
        const { data } = await supabase
          .from("custom_bots").select("commands").eq("bot_user_id", chat.peer.id).maybeSingle();
        if (data?.commands) this._activeBotCommands = data.commands;
      } catch (_) {}
    }
    this.renderMessages();
    if (chat.peer?.username?.toLowerCase() === "helperbot" && !this.messages.length) {
      const box = $("messages");
      const big = document.createElement("button");
      big.className = "btn btn-primary";
      big.style.cssText = "margin:20px auto;display:block;padding:14px 22px;font-size:15px";
      big.textContent = "🤖 Создать бота";
      big.addEventListener("click", () => this.openBotFather());
      box.appendChild(big);
    }
    await this.checkStrangerBanner();
    this.subscribeChat(chat.id);
    this.subscribeTyping(chat.id);
    this.subscribePolls(chat.id);
    this.startPolling(chat.id);
    this.markChatRead(chat.id);
    this.hideReplyPreview();
  }
  async loadMembers() {
    try {
      const { data, error } = await supabase.rpc("chat_members_with_profiles", { p_chat_id: this.activeChat.id });
      if (error) throw error;
      this.members = data || [];
    } catch (e) { console.error(e); this.members = []; }
  }
  async loadMessages() {
    const { data, error } = await supabase
      .from("messages")
      .select("id, chat_id, sender_id, content, kind, sticker_id, attachment_url, attachment_type, file_name, file_size, edited_at, created_at, reply_to, pinned, pinned_at, channel_post_id, expires_at")
      .eq("chat_id", this.activeChat.id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) { console.error(error); this.messages = []; return; }
    this.messages = data || [];
  }
  async loadReactions() {
    try {
      const { data, error } = await supabase
        .from("reactions").select("message_id, user_id, emoji, messages!inner(chat_id)")
        .eq("messages.chat_id", this.activeChat.id);
      if (error) throw error;
      const map = {};
      (data || []).forEach(r => {
        if (!map[r.message_id]) map[r.message_id] = {};
        if (!map[r.message_id][r.emoji]) map[r.message_id][r.emoji] = [];
        map[r.message_id][r.emoji].push(r.user_id);
      });
      this.reactions = map;
    } catch (e) { console.error(e); this.reactions = {}; }
  }
  async loadPolls() {
    try {
      const { data, error } = await supabase
        .from("polls")
        .select("id, chat_id, message_id, author_id, question, options, is_quiz, correct_index, is_anonymous, allows_multiple, closed")
        .eq("chat_id", this.activeChat.id);
      if (error) throw error;
      const map = {};
      (data || []).forEach(p => { if (p.message_id) map[p.message_id] = { ...p, votes: {} }; });
      const pollIds = (data || []).map(p => p.id);
      if (pollIds.length) {
        const { data: votes } = await supabase
          .from("poll_votes").select("poll_id, user_id, option_indices").in("poll_id", pollIds);
        (votes || []).forEach(v => {
          const poll = Object.values(map).find(p => p.id === v.poll_id);
          if (poll) poll.votes[v.user_id] = v.option_indices || [];
        });
      }
      this.polls = map;
    } catch (e) { console.error("loadPolls:", e); this.polls = {}; }
  }
  async checkStrangerBanner() {
    const bar = $("stranger-bar"); if (!bar) return;
    bar.classList.add("hidden"); bar.innerHTML = "";
    if (!this.activeChat) return;
    if (this.activeChat.type === "saved") return;
    if (this.activeChat.is_notification) return;
    if (this.activeChat.type !== "direct") return;
    const peer = this.activeChat.peer;
    if (!peer || peer.is_bot) return;
    const inContacts = this.contacts.some(c => c.id === peer.id);
    if (inContacts) return;
    if (this.messages.length > 0) return;
    bar.classList.remove("hidden");
    bar.innerHTML = `
      <div class="stranger-info">
        <span class="stranger-icon">⚠️</span>
        <div>
          <div class="stranger-title">Незнакомый пользователь</div>
          <div class="stranger-sub">Вы ещё не переписывались. Будьте осторожны.</div>
        </div>
      </div>
      <div class="stranger-actions">
        <button class="btn btn-primary" id="stranger-add">+ В контакты</button>
        <button class="btn btn-danger" id="stranger-block">Заблокировать</button>
      </div>`;
    bar.querySelector("#stranger-add").addEventListener("click", async () => {
      try {
        await this.addContact(peer.id);
        await this.refreshContacts();
        bar.classList.add("hidden");
        toast("Добавлен в контакты", "success");
        Sounds.success();
      } catch (e) { toast(e.message || "Ошибка", "error"); }
    });
    bar.querySelector("#stranger-block").addEventListener("click", async () => {
      if (!confirm(`Заблокировать @${peer.username}?`)) return;
      try {
        await this.blockUser(peer.id);
        bar.classList.add("hidden");
        this.activeChat = null;
        $("chat-view").classList.add("hidden");
        $("welcome").classList.remove("hidden");
        await this.refreshChats();
        toast("Пользователь заблокирован", "warning");
        Sounds.error();
      } catch (e) { toast(e.message || "Ошибка", "error"); }
    });
  }
  async blockUser(userId) {
    const { error } = await supabase.from("blocks").insert({
      blocker_id: this.user.id, blocked_id: userId,
    });
    if (error && error.code !== "23505") throw error;
  }

  /* ============================================================
     RENDER MESSAGES
     ============================================================ */
  renderMessages() {
    const box = $("messages");
    box.innerHTML = "";
    if (!this.messages.length) {
      box.innerHTML = `<div class="empty-state">Нет сообщений. Напиши первое!</div>`;
      return;
    }
    this.visibleStart = Math.max(0, this.messages.length - this.virtualWindow);
    this.paintMessageWindow();
    box.removeEventListener("scroll", this._onScrollHandler || (() => {}));
    this._onScrollHandler = () => {
      if (box.scrollTop < 80 && this.visibleStart > 0) {
        this.visibleStart = Math.max(0, this.visibleStart - 40);
        const prev = box.scrollHeight;
        this.paintMessageWindow();
        requestAnimationFrame(() => { box.scrollTop = box.scrollHeight - prev + box.scrollTop; });
      }
    };
    box.addEventListener("scroll", this._onScrollHandler);
    if (this.messageSearchQuery) this.highlightSearch();
  }
  paintMessageWindow() {
    const box = $("messages");
    box.innerHTML = "";
    const slice = this.messages.slice(this.visibleStart);
    if (this.visibleStart > 0) {
      const more = document.createElement("div");
      more.className = "date-sep";
      more.textContent = `↑ ${this.visibleStart} старых сообщений`;
      box.appendChild(more);
    }
    const pinned = this.messages.filter(m => m.pinned);
    if (pinned.length) {
      const pinBar = document.createElement("div");
      pinBar.className = "pinned-bar";
      pinBar.innerHTML = `<span>📌 Закреплено: ${escapeHtml((pinned[pinned.length - 1].content || "").slice(0, 50))}</span>`;
      pinBar.addEventListener("click", () => {
        const el = document.querySelector(`[data-message-id="${pinned[pinned.length - 1].id}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      box.appendChild(pinBar);
    }
    let prev = null;
    slice.forEach(m => {
      const needDate = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
      if (needDate) {
        const sep = document.createElement("div");
        sep.className = "date-sep";
        sep.textContent = formatDateLabel(m.created_at);
        box.appendChild(sep);
      }
      box.appendChild(this.renderOneMessage(m));
      prev = m;
    });
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }
  renderOneMessage(m) {
    const isOwn = m.sender_id === this.user.id;
    const sender = this.members.find(x => x.user_id === m.sender_id);
    const senderName = isOwn ? "Ты" : (sender?.username || this.activePeer?.username || "User");
    const isBot = !!sender?.is_bot;

    if (m.kind === "system" || m.kind === "auth") {
      const row = document.createElement("div");
      row.className = "msg-row system";
      row.dataset.messageId = m.id;
      const bubble = document.createElement("div");
      bubble.className = "msg-bubble";
      bubble.textContent = m.content || "";
      row.appendChild(bubble);
      return row;
    }

    const row = document.createElement("div");
    row.className = "msg-row" + (isOwn ? " own" : "");
    row.dataset.messageId = m.id;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    if (m.pinned) bubble.classList.add("pinned");

    if (m.reply_to) {
      const parent = this.messages.find(x => x.id === m.reply_to);
      if (parent) {
        const rp = document.createElement("div");
        rp.className = "msg-reply";
        const parentSender = this.members.find(x => x.user_id === parent.sender_id);
        const parentName = parent.sender_id === this.user.id ? "Ты" : (parentSender?.username || "User");
        rp.innerHTML = `<div class="msg-reply-name">${escapeHtml(parentName)}</div>
          <div class="msg-reply-text">${escapeHtml((parent.content || "").slice(0, 80))}</div>`;
        rp.addEventListener("click", () => {
          const el = document.querySelector(`[data-message-id="${parent.id}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        bubble.appendChild(rp);
      }
    }

    const ctype = this.activeChat?.type || "direct";
    if (!isOwn && ctype !== "direct" && ctype !== "saved") {
      const h = document.createElement("div");
      h.className = "msg-sender";
      h.innerHTML = escapeHtml(senderName) + (isBot ? ' <span class="bot-badge">[BOT]</span>' : "");
      bubble.appendChild(h);
    }

    const content = document.createElement("div");
    content.className = "msg-content";
    if (m.kind === "poll" && this.polls && this.polls[m.id]) {
      this.renderPoll(bubble, this.polls[m.id], m);
    } else {
      this.renderMessageContent(content, m);
      bubble.appendChild(content);
    }

    if (ctype === "channel" && !m.channel_post_id && m.kind !== "poll") {
      const commentsBtn = document.createElement("button");
      commentsBtn.className = "comments-btn";
      commentsBtn.textContent = `💬 ${t("comments")}`;
      commentsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openCommentsFor(m);
      });
      bubble.appendChild(commentsBtn);
    }

    const rx = this.reactions[m.id] || {};
    const rxKeys = Object.keys(rx);
    if (rxKeys.length) {
      const rbox = document.createElement("div");
      rbox.className = "msg-reactions";
      rxKeys.forEach(emoji => {
        const chip = document.createElement("div");
        chip.className = "reaction-chip" + (rx[emoji].includes(this.user.id) ? " mine" : "");
        chip.textContent = `${emoji} ${rx[emoji].length}`;
        chip.addEventListener("click", () => this.toggleReaction(m.id, emoji));
        rbox.appendChild(chip);
      });
      bubble.appendChild(rbox);
    }

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    let statusHTML = "";
    if (isOwn) {
      const isRead = this.isMessageRead(m);
      statusHTML = `<span class="msg-status${isRead ? " read" : ""}">
        <span class="check">${isRead ? "✓✓" : "✓"}</span>
      </span>`;
    }
    meta.innerHTML = `${m.edited_at ? '<span class="msg-edited">(изменено)</span>' : ""}
      <span>${escapeHtml(formatTime(m.created_at))}</span>${statusHTML}`;
    bubble.appendChild(meta);

    row.appendChild(bubble);

    let clickTimer = null;
    row.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      if (e.target.closest(".comments-btn")) return;
      if (clickTimer) {
        clearTimeout(clickTimer); clickTimer = null;
        this.openReactionBar(e, m);
      } else {
        clickTimer = setTimeout(() => { clickTimer = null; }, 260);
      }
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.openMessageContextMenu(e, m, isOwn);
    });
    return row;
  }
  renderPoll(bubble, poll, msg) {
    const card = document.createElement("div");
    card.className = "poll-card";
    const q = document.createElement("div");
    q.className = "poll-question";
    q.innerHTML = escapeHtml(poll.question) + (poll.is_quiz ? ' <span class="channel-badge public">Викторина</span>' : "");
    card.appendChild(q);
    const options = Array.isArray(poll.options) ? poll.options : [];
    const myVote = poll.votes[this.user.id] || [];
    const totalVotes = Object.keys(poll.votes).length;
    const counts = options.map(() => 0);
    Object.values(poll.votes).forEach(voteArr => {
      (voteArr || []).forEach(i => { if (counts[i] != null) counts[i] += 1; });
    });
    options.forEach((opt, idx) => {
      const optEl = document.createElement("div");
      optEl.className = "poll-option";
      const isVoted = myVote.includes(idx);
      if (isVoted) optEl.classList.add("voted");
      if (poll.is_quiz && poll.correct_index === idx) optEl.classList.add("correct");
      if (poll.is_quiz && isVoted && poll.correct_index !== idx) optEl.classList.add("incorrect");
      const pct = totalVotes > 0 ? Math.round((counts[idx] / totalVotes) * 100) : 0;
      optEl.innerHTML = `
        <div class="poll-option-bar" style="width:${pct}%"></div>
        <div class="poll-option-text">
          <span><span class="poll-checkbox"></span>${escapeHtml(opt)}</span>
          <span class="poll-option-pct">${pct}%</span>
        </div>`;
      optEl.addEventListener("click", async () => {
        if (poll.closed) return toast("Опрос закрыт", "warning");
        let newVote;
        if (poll.allows_multiple) {
          newVote = new Set(myVote);
          if (newVote.has(idx)) newVote.delete(idx);
          else newVote.add(idx);
          newVote = [...newVote];
          if (!newVote.length) return;
        } else newVote = [idx];
        try {
          const { error } = await supabase.rpc("vote_poll", { p_poll_id: poll.id, p_options: newVote });
          if (error) throw error;
          poll.votes[this.user.id] = newVote;
          this.paintMessageWindow();
          Sounds.click();
        } catch (e) { toast(e.message || "Ошибка", "error"); }
      });
      card.appendChild(optEl);
    });
    const meta = document.createElement("div");
    meta.className = "poll-meta";
    const votesWord = totalVotes === 1 ? "голос" : (totalVotes < 5 ? "голоса" : "голосов");
    meta.textContent = `${totalVotes} ${votesWord}` +
      (poll.is_anonymous ? " · анонимный" : "") +
      (poll.allows_multiple ? " · несколько вариантов" : "") +
      (poll.closed ? " · закрыт" : "");
    card.appendChild(meta);
    bubble.appendChild(card);
  }
  renderMessageContent(el, m) {
    el.innerHTML = "";
    const kind = m.kind || "text";
    if (kind === "sticker") {
      let url = m.attachment_url;
      if (!url && m.sticker_id?.startsWith("sys-")) {
        url = SYSTEM_STICKERS.find(s => s.id === m.sticker_id)?.url || "";
      }
      if (url) {
        const img = document.createElement("img");
        img.className = "msg-sticker"; img.src = url; img.alt = "sticker";
        el.appendChild(img);
      }
      if ((m.content || "").trim()) {
        const c = document.createElement("div"); c.innerHTML = renderMarkdown(m.content); el.appendChild(c);
      }
      return;
    }
    if (kind === "image" && m.attachment_url) {
      const img = document.createElement("img");
      img.className = "msg-image"; img.src = m.attachment_url; img.loading = "lazy";
      img.alt = m.file_name || "image";
      img.addEventListener("click", () => this.openLightbox(m.attachment_url, "image"));
      el.appendChild(img);
      if ((m.content || "").trim()) { const c = document.createElement("div"); c.innerHTML = renderMarkdown(m.content); el.appendChild(c); }
      return;
    }
    if (kind === "video" && m.attachment_url) {
      const v = document.createElement("video");
      v.className = "msg-video"; v.src = m.attachment_url; v.controls = true; v.preload = "metadata";
      el.appendChild(v);
      if ((m.content || "").trim()) { const c = document.createElement("div"); c.innerHTML = renderMarkdown(m.content); el.appendChild(c); }
      return;
    }
    if (kind === "voice" && m.attachment_url) {
      const a = document.createElement("audio");
      a.controls = true; a.src = m.attachment_url;
      a.style.cssText = "max-width:280px;margin:4px 0";
      el.appendChild(a);
      if ((m.content || "").trim() && m.content !== "[голосовое]") {
        const c = document.createElement("div");
        c.style.cssText = "font-size:12px;color:var(--text-2);font-style:italic;margin-top:4px";
        c.textContent = m.content;
        el.appendChild(c);
      }
      return;
    }
    if (kind === "file" && m.attachment_url) {
      const a = document.createElement("a");
      a.className = "msg-file"; a.href = m.attachment_url;
      a.target = "_blank"; a.rel = "noopener noreferrer";
      a.download = m.file_name || "";
      a.innerHTML = `
        <div class="msg-file-icon">${this.fileIcon(m.file_name)}</div>
        <div>
          <div class="msg-file-name">${escapeHtml(m.file_name || "Файл")}</div>
          <div class="msg-file-size">${escapeHtml(humanSize(m.file_size))}</div>
        </div>`;
      el.appendChild(a);
      if ((m.content || "").trim()) { const c = document.createElement("div"); c.innerHTML = renderMarkdown(m.content); el.appendChild(c); }
      return;
    }
    el.innerHTML = renderMarkdown(m.content || "");
    this.replaceCustomEmojis(el);
  }
  async replaceCustomEmojis(el) {
    const html = el.innerHTML;
    const matches = [...html.matchAll(/:([a-zA-Z0-9_]{2,32}):/g)];
    if (!matches.length) return;
    const codes = [...new Set(matches.map(m => m[1]))];
    try {
      const { data } = await supabase
        .from("custom_emojis").select("shortcode, url").in("shortcode", codes).limit(50);
      if (!data || !data.length) return;
      let newHtml = html;
      data.forEach(e => {
        const re = new RegExp(`:${e.shortcode}:`, "g");
        newHtml = newHtml.replace(re, `<img class="custom-emoji" src="${safeUrl(e.url)}" alt=":${e.shortcode}:">`);
      });
      el.innerHTML = newHtml;
    } catch (_) {}
  }
  fileIcon(name) {
    if (!name) return "📄";
    const ext = name.split(".").pop().toLowerCase();
    if (["zip","rar","7z","tar","gz"].includes(ext)) return "🗜️";
    if (ext === "pdf") return "📕";
    if (["doc","docx","rtf","odt"].includes(ext)) return "📘";
    if (["xls","xlsx","csv","ods"].includes(ext)) return "📗";
    if (["ppt","pptx","odp"].includes(ext)) return "📙";
    if (["mp3","wav","ogg","flac","m4a"].includes(ext)) return "🎵";
    if (["mp4","mov","avi","mkv","webm"].includes(ext)) return "🎬";
    return "📄";
  }
  highlightSearch() {
    if (!this.messageSearchQuery) return;
    const q = this.messageSearchQuery.toLowerCase();
    $$(".msg-content").forEach(el => {
      const html = el.innerHTML;
      if (html.toLowerCase().includes(q)) el.parentElement?.classList.add("search-hit");
    });
  }
  openLightbox(url, kind) {
    const lb = document.createElement("div");
    lb.className = "lightbox";
    let node;
    if (kind === "video") { node = document.createElement("video"); node.src = url; node.controls = true; node.autoplay = true; }
    else { node = document.createElement("img"); node.src = url; }
    lb.appendChild(node);
    lb.addEventListener("click", () => lb.remove());
    document.body.appendChild(lb);
  }

  /* ============================================================
     MESSAGE CONTEXT MENU
     ============================================================ */
  openMessageContextMenu(event, msg, isOwn) {
    this.closeContextMenu();
    const menu = document.createElement("div");
    menu.className = "ctx-menu"; menu.id = "ctx-menu";
    const rxRow = document.createElement("div");
    rxRow.className = "reactions-row";
    QUICK_REACTIONS.forEach(e => {
      const b = document.createElement("button");
      b.textContent = e;
      b.addEventListener("click", () => { this.closeContextMenu(); this.toggleReaction(msg.id, e); });
      rxRow.appendChild(b);
    });
    menu.appendChild(rxRow);
    const mk = (label, handler, danger = false) => {
      const b = document.createElement("button");
      b.textContent = label;
      if (danger) b.classList.add("danger");
      b.addEventListener("click", () => { this.closeContextMenu(); handler(); });
      menu.appendChild(b);
    };
    mk(`↩ ${t("reply")}`, () => this.setReplyTo(msg));
    if (isOwn && (msg.kind || "text") === "text") mk(`✎ ${t("edit")}`, () => this.editMessage(msg));
    mk(`📋 ${t("copy")}`, () => {
      navigator.clipboard.writeText(msg.content || msg.attachment_url || "");
      toast("Скопировано", "success"); Sounds.click();
    });
    mk("🔗 Ссылка на сообщение", () => this.copyMessageLink(msg));
    mk("↪ Переслать", () => this.forwardMessage(msg));
    if (this.activeChat?.type !== "saved" && !this.activeChat?.is_notification) {
      mk("⭐ В избранное", () => this.saveToFavorites(msg));
    }
    mk(msg.pinned ? "📌 Открепить" : "📌 Закрепить", () => this.togglePin(msg));
    if (isOwn) mk(`🗑 ${t("delete")}`, () => this.deleteMessage(msg), true);
    document.body.appendChild(menu);
    const r = event.target.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = Math.min(r.right - mw, window.innerWidth - mw - 10);
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight) top = r.top - mh - 6;
    if (left < 10) left = 10;
    menu.style.left = left + "px"; menu.style.top = top + "px";
    setTimeout(() => document.addEventListener("click", this.closeContextMenu, { once: true }), 0);
  }
  openReactionBar(event, msg) {
    this.closeContextMenu();
    const bar = document.createElement("div");
    bar.className = "reaction-bar"; bar.id = "ctx-menu";
    QUICK_REACTIONS.forEach(e => {
      const b = document.createElement("button");
      b.textContent = e;
      b.addEventListener("click", () => { this.closeContextMenu(); this.toggleReaction(msg.id, e); });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
    const r = event.target.getBoundingClientRect();
    bar.style.left = Math.min(r.left, window.innerWidth - 260) + "px";
    bar.style.top = Math.max(10, r.top - 50) + "px";
    setTimeout(() => document.addEventListener("click", this.closeContextMenu, { once: true }), 0);
  }
  closeContextMenu() { const m = $("ctx-menu"); if (m) m.remove(); }
  setReplyTo(msg) {
    this.pendingReplyTo = msg;
    const sender = this.members.find(x => x.user_id === msg.sender_id);
    const name = msg.sender_id === this.user.id ? "Ты" : (sender?.username || "User");
    const bar = $("reply-bar");
    if (bar) {
      bar.classList.remove("hidden");
      bar.innerHTML = `
        <div class="reply-bar-body">
          <div class="reply-bar-name">↩ ${escapeHtml(name)}</div>
          <div class="reply-bar-text">${escapeHtml((msg.content || "").slice(0, 90))}</div>
        </div>
        <button class="icon-btn" id="reply-cancel">✕</button>`;
      bar.querySelector("#reply-cancel").addEventListener("click", () => this.hideReplyPreview());
    }
    $("composer").focus();
  }
  hideReplyPreview() {
    this.pendingReplyTo = null;
    const bar = $("reply-bar");
    if (bar) { bar.classList.add("hidden"); bar.innerHTML = ""; }
  }
  async togglePin(msg) {
    try {
      const next = !msg.pinned;
      const { data, error } = await supabase.from("messages")
        .update({ pinned: next, pinned_at: next ? new Date().toISOString() : null, pinned_by: next ? this.user.id : null })
        .eq("id", msg.id).select().single();
      if (error) throw error;
      const i = this.messages.findIndex(m => m.id === msg.id);
      if (i >= 0) this.messages[i] = data;
      this.paintMessageWindow();
      toast(next ? "Закреплено" : "Откреплено", "success");
      Sounds.click();
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }
  forwardMessage(msg) {
    const sorted = [...this.chats].sort((a, b) => {
      const aS = a.is_notification ? 1 : a.type === "saved" ? 0 : 2;
      const bS = b.is_notification ? 1 : b.type === "saved" ? 0 : 2;
      return aS - bS;
    });
    this.openModal({
      title: "Переслать в…", narrow: true,
      body: (body) => {
        if (!sorted.length) { body.innerHTML = `<p class="muted">У тебя пока нет чатов</p>`; return; }
        sorted.forEach(c => {
          const row = document.createElement("div");
          row.className = "settings-row"; row.style.cursor = "pointer";
          const label = c.is_notification ? "📩 NEXORA" : c.type === "saved" ? "⭐ Избранное" : c.display_title;
          const desc = c.is_notification ? "уведомления" : c.type === "saved" ? "сохранённые сообщения" : c.type;
          row.innerHTML = `<div class="settings-row-info">
            <div class="settings-row-label">${escapeHtml(label)}</div>
            <div class="settings-row-desc">${escapeHtml(desc)}</div>
          </div><button class="btn btn-primary">→</button>`;
          row.querySelector("button").addEventListener("click", async () => {
            try {
              await supabase.from("messages").insert({
                chat_id: c.id, sender_id: this.user.id,
                content: msg.content || "", kind: msg.kind || "text",
                attachment_url: msg.attachment_url, attachment_type: msg.attachment_type,
                file_name: msg.file_name, file_size: msg.file_size,
                sticker_id: msg.sticker_id,
              });
              toast("Переслано", "success"); Sounds.send();
              this.closeModal();
            } catch (e) { toast(e.message || "Ошибка", "error"); }
          });
          body.appendChild(row);
        });
      },
    });
  }

  /* ============================================================
     SENDING
     ============================================================ */
  async sendCurrent() {
    const input = $("composer");
    const text = input.value.trim();
    const att = this.pendingAttachment;
    const reply = this.pendingReplyTo;
    if (!text && !att) return;
    if (!this.activeChat) return;
    input.value = ""; input.style.height = "auto";
    try {
      let payload;
      if (att) {
        payload = {
          chat_id: this.activeChat.id, sender_id: this.user.id,
          content: text.slice(0, 4000), kind: att.kind,
          attachment_url: att.url, attachment_type: att.kind,
          file_name: att.name, file_size: att.size,
          reply_to: reply?.id || null,
        };
        this.pendingAttachment = null;
        this.hideAttachBar();
      } else {
        payload = {
          chat_id: this.activeChat.id, sender_id: this.user.id,
          content: text, kind: "text", reply_to: reply?.id || null,
        };
      }
      const { data, error } = await supabase.from("messages").insert(payload).select().single();
      if (error) throw error;
      if (!this.messages.find(m => m.id === data.id)) {
        this.messages.push(data);
        this.paintMessageWindow();
      }
      this.hideReplyPreview();
      this.refreshChats();
      Sounds.send();
      this.maybeBotReply(data);
      setTimeout(() => this.checkStrangerBanner(), 200);
    } catch (e) {
      console.error(e);
      toast("Не удалось отправить", "error");
    }
  }

  /* ============================================================
     BOTS
     ============================================================ */
  maybeBotReply(msg) {
    if (!this.activeChat?.peer?.is_bot) return;
    if (msg.sender_id !== this.user.id) return;
    const text = (msg.content || "").trim();
    if (!text.startsWith("/")) return;
    const [cmd, ...args] = text.split(/\s+/);
    const key = cmd.toLowerCase();
    if (key === "/newbot") {
      this.deliverBotReply("Открываю мастер создания бота…");
      setTimeout(() => this.openBotFather(), 300); return;
    }
    if (key === "/mybots") {
      this.deliverBotReply("Открываю список ботов…");
      setTimeout(() => this.openMyBots(), 300); return;
    }
    const builtin = BOT_COMMANDS[key];
    if (builtin) {
      const reply = typeof builtin === "function" ? builtin(args) : builtin;
      this.deliverBotReply(reply); return;
    }
    if (Array.isArray(this._activeBotCommands)) {
      const custom = this._activeBotCommands.find(c => (c.cmd || "").toLowerCase() === key);
      if (custom) { this.deliverBotReply(custom.reply || ""); return; }
    }
  }
  async deliverBotReply(text) {
    if (!this.activeChat) return;
    try {
      const { error } = await supabase.rpc("bot_reply", {
        p_chat_id: this.activeChat.id, p_content: text,
      });
      if (error) throw error;
    } catch (e) { console.error("bot_reply:", e); }
  }
  openBotFather() {
    this.openModal({
      title: "Создание бота",
      body: (body) => {
        body.innerHTML = `
          <div class="form-group">
            <label>Username (латиница, 3–24)</label>
            <input id="bf-username" maxlength="24" placeholder="MyCoolBot">
          </div>
          <div class="form-group">
            <label>Отображаемое имя</label>
            <input id="bf-name" maxlength="40" placeholder="My Cool Bot">
          </div>
          <div class="form-group">
            <label>Описание</label>
            <input id="bf-desc" maxlength="200" placeholder="Что делает бот">
          </div>
          <div class="form-group">
            <label>Команды (по одной на строку)</label>
            <textarea id="bf-commands" rows="5" placeholder="/start Привет!
/help Помощь"></textarea>
          </div>
          <div id="bf-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="bf-cancel">${t("cancel")}</button>
            <button class="btn btn-primary" id="bf-create">Создать бота</button>
          </div>`;
        body.querySelector("#bf-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#bf-create").addEventListener("click", async () => {
          const username = body.querySelector("#bf-username").value.trim();
          const name = body.querySelector("#bf-name").value.trim();
          const desc = body.querySelector("#bf-desc").value.trim();
          const commandsRaw = body.querySelector("#bf-commands").value;
          const errEl = body.querySelector("#bf-error");
          errEl.classList.remove("show");
          if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
            errEl.textContent = "Username: 3–24, латиница/цифры/_";
            errEl.classList.add("show"); return;
          }
          const commands = commandsRaw.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
            const m = line.match(/^(\S+)\s+(.*)$/);
            if (m) return { cmd: m[1], reply: m[2] };
            return { cmd: line, reply: "(нет ответа)" };
          });
          try {
            const { data, error } = await supabase.rpc("create_custom_bot", {
              p_username: username, p_display_name: name || username,
              p_description: desc, p_commands: commands,
            });
            if (error) throw error;
            toast("Бот создан", "success");
            Sounds.success();
            this.closeModal();
            setTimeout(() => this.openBotChatById(data), 300);
          } catch (e) {
            errEl.textContent = e.message || "Ошибка";
            errEl.classList.add("show");
          }
        });
      },
    });
  }
  async openMyBots() {
    try {
      const { data } = await supabase.from("custom_bots")
        .select("bot_user_id, username, display_name, description, commands, created_at")
        .eq("owner_id", this.user.id).order("created_at", { ascending: false });
      this.openModal({
        title: "Мои боты",
        body: (body) => {
          if (!data?.length) { body.innerHTML = `<p class="muted">У тебя пока нет ботов</p>`; return; }
          data.forEach(b => {
            const row = document.createElement("div");
            row.className = "settings-row";
            row.innerHTML = `<div class="settings-row-info">
              <div class="settings-row-label">${escapeHtml(b.display_name)} <span class="bot-badge">[BOT]</span></div>
              <div class="settings-row-desc">@${escapeHtml(b.username)} · ${(b.commands || []).length} команд</div>
            </div>`;
            const open = document.createElement("button");
            open.className = "btn btn-ghost"; open.textContent = "Открыть";
            open.addEventListener("click", () => { this.closeModal(); this.openBotChatById(b.bot_user_id); });
            row.appendChild(open);
            body.appendChild(row);
          });
        },
      });
    } catch (e) { toast("Ошибка загрузки", "error"); }
  }
  async openBotChatById(botUserId) {
    try {
      const res = await supabase.rpc("get_or_create_direct_chat", { other_user: botUserId });
      if (res.error) throw res.error;
      await this.refreshChats();
      const chat = this.chats.find(c => c.id === res.data);
      if (chat) this.openChat(chat);
    } catch (e) { toast("Не удалось открыть чат с ботом", "error"); }
  }

  /* ============================================================
     EDIT / DELETE / REACTIONS / FAVORITES
     ============================================================ */
  async editMessage(msg) {
    const newText = prompt("Новый текст:", msg.content);
    if (newText === null || !newText.trim()) return;
    try {
      const { data, error } = await supabase
        .from("messages")
        .update({ content: newText.trim(), edited_at: new Date().toISOString() })
        .eq("id", msg.id).select().single();
      if (error) throw error;
      const i = this.messages.findIndex(m => m.id === msg.id);
      if (i >= 0) this.messages[i] = data;
      this.paintMessageWindow();
      toast("Изменено", "success");
      Sounds.click();
    } catch (e) { toast("Ошибка", "error"); }
  }
  async deleteMessage(msg) {
    if (!confirm("Удалить сообщение?")) return;
    try {
      const { error } = await supabase.from("messages").delete().eq("id", msg.id);
      if (error) throw error;
      this.messages = this.messages.filter(m => m.id !== msg.id);
      this.paintMessageWindow();
      toast("Удалено", "success");
      Sounds.click();
    } catch (e) { toast("Ошибка", "error"); }
  }
  async toggleReaction(messageId, emoji) {
    try {
      const { data: existing } = await supabase
        .from("reactions").select("message_id")
        .eq("message_id", messageId).eq("user_id", this.user.id).eq("emoji", emoji)
        .maybeSingle();
      if (existing) {
        await supabase.from("reactions").delete()
          .eq("message_id", messageId).eq("user_id", this.user.id).eq("emoji", emoji);
      } else {
        await supabase.from("reactions").insert({
          message_id: messageId, user_id: this.user.id, emoji,
        });
      }
      Sounds.click();
      await this.loadReactions();
      this.paintMessageWindow();
    } catch (e) { console.error(e); }
  }
  async saveToFavorites(msg) {
    try {
      const { error } = await supabase.from("favorites").insert({
        owner_id: this.user.id, message_id: msg.id, chat_id: this.activeChat.id,
      });
      if (error && error.code !== "23505") throw error;
      toast("Сохранено в избранное", "success");
      Sounds.success();
    } catch (e) { toast("Ошибка", "error"); }
  }

  /* ============================================================
     ATTACHMENTS
     ============================================================ */
  async pickAttachment() {
    if (!this.activeChat) return;
    const input = $("file-attach");
    input.value = "";
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      if (file.size > ATTACH_MAX) return toast("Файл больше 50 MB", "warning");
      try {
        toast("Загрузка…", "info");
        const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
        const path = `${this.user.id}/${this.activeChat.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(ATTACH_BUCKET)
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(ATTACH_BUCKET).getPublicUrl(path);
        const kind = file.type.startsWith("image/") ? "image"
                  : file.type.startsWith("video/") ? "video" : "file";
        this.pendingAttachment = { url: pub.publicUrl, kind, name: file.name, size: file.size };
        $("attach-label").textContent = `📎 ${file.name} (${humanSize(file.size)}) — Enter для отправки`;
        $("attach-bar").classList.remove("hidden");
        toast("Готово", "success");
        Sounds.click();
      } catch (e) {
        console.error(e); toast("Не удалось загрузить", "error");
      }
    };
    input.click();
  }
  hideAttachBar() {
    this.pendingAttachment = null;
    $("attach-bar").classList.add("hidden");
    $("attach-label").textContent = "";
  }

  /* ============================================================
     VOICE RECORDING
     ============================================================ */
  async toggleVoiceRecording() {
    if (this._recorder && this._recorder.state === "recording") {
      return this.stopVoiceRecording();
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      return toast("Запись голоса не поддерживается", "error");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._recorder = new MediaRecorder(stream);
      this._chunks = [];
      this._recorder.ondataavailable = (e) => { if (e.data.size) this._chunks.push(e.data); };
      this._recorder.onstop = () => this._finishVoiceRecording();
      this._recorder.start();
      this._recStartAt = Date.now();
      const bar = $("voice-bar");
      if (bar) { bar.classList.remove("hidden"); bar.querySelector(".voice-time").textContent = "0:00"; }
      this._voiceTimer = setInterval(() => {
        const sec = Math.floor((Date.now() - this._recStartAt) / 1000);
        const mm = Math.floor(sec / 60);
        const ss = String(sec % 60).padStart(2, "0");
        const b2 = $("voice-bar");
        if (b2) b2.querySelector(".voice-time").textContent = `${mm}:${ss}`;
      }, 500);
    } catch (e) { toast("Нет доступа к микрофону", "error"); }
  }
  stopVoiceRecording() {
    if (!this._recorder) return;
    try { this._recorder.stop(); } catch (_) {}
    if (this._voiceTimer) { clearInterval(this._voiceTimer); this._voiceTimer = null; }
    const bar = $("voice-bar");
    if (bar) bar.classList.add("hidden");
  }
  async _finishVoiceRecording() {
    const chunks = this._chunks || [];
    this._chunks = [];
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: "audio/webm" });
    const buffer = await blob.arrayBuffer();
    try {
      const path = `${this.user.id}/${this.activeChat.id}/${Date.now()}-voice.webm`;
      const { error: upErr } = await supabase.storage
        .from(ATTACH_BUCKET)
        .upload(path, buffer, { contentType: "audio/webm", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(ATTACH_BUCKET).getPublicUrl(path);
      let transcript = "";
      try { transcript = await this.transcribeAudio(blob); } catch (_) {}
      const payload = {
        chat_id: this.activeChat.id, sender_id: this.user.id,
        content: transcript || "[голосовое]", kind: "voice",
        attachment_url: pub.publicUrl, attachment_type: "voice",
        file_name: "voice.webm", file_size: blob.size,
      };
      const { data, error } = await supabase.from("messages").insert(payload).select().single();
      if (error) throw error;
      if (!this.messages.find(m => m.id === data.id)) {
        this.messages.push(data);
        this.paintMessageWindow();
      }
      Sounds.send();
      toast(transcript ? "Голосовое отправлено + расшифровано" : "Голосовое отправлено", "success");
    } catch (e) { toast("Ошибка голосового: " + (e.message || ""), "error"); }
  }
  async transcribeAudio(blob) {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) return "";
    return new Promise((resolve) => {
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new Ctor();
      rec.lang = currentLocale();
      rec.continuous = true;
      rec.interimResults = false;
      let finalText = "";
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
        }
      };
      rec.onerror = () => { rec.stop(); resolve(finalText.trim()); };
      rec.onend = () => resolve(finalText.trim());
      const audio = new Audio(URL.createObjectURL(blob));
      audio.play().then(() => rec.start()).catch(() => resolve(""));
      audio.onended = () => { try { rec.stop(); } catch (_) {} };
      setTimeout(() => { try { rec.stop(); } catch (_) {} }, 60000);
    });
  }

  /* ============================================================
     PICKER (emoji / stickers)
     ============================================================ */
  openPicker() {
    const existing = $("picker");
    if (existing) { existing.remove(); return; }
    const picker = document.createElement("div");
    picker.id = "picker"; picker.className = "picker";
    const tabs = document.createElement("div");
    tabs.className = "picker-tabs"; picker.appendChild(tabs);
    const body = document.createElement("div");
    body.className = "picker-body"; picker.appendChild(body);
    document.querySelector(".chat-view").appendChild(picker);
    const addTab = (label, onClick) => {
      const b = document.createElement("button");
      b.className = "picker-tab"; b.textContent = label;
      b.addEventListener("click", () => {
        tabs.querySelectorAll(".picker-tab").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        onClick();
      });
      tabs.appendChild(b);
      return b;
    };
    Object.keys(EMOJI).forEach((cat, idx) => {
      const tt = addTab(cat, () => renderEmojiCat(cat));
      if (idx === 0) { tt.classList.add("active"); renderEmojiCat(cat); }
    });
    addTab("🎨 " + t("emojiPacks"), () => renderStickers());
    function renderEmojiCat(cat) {
      body.className = "picker-body"; body.innerHTML = "";
      (EMOJI[cat] || []).forEach(e => {
        const b = document.createElement("button");
        b.className = "picker-emoji"; b.textContent = e;
        b.addEventListener("click", () => {
          const composer = $("composer");
          composer.value += e; composer.focus();
        });
        body.appendChild(b);
      });
    }
    async function renderStickers() {
      body.className = "picker-body stickers"; body.innerHTML = "";
      SYSTEM_STICKERS.forEach(s => {
        const tt = document.createElement("div");
        tt.className = "picker-sticker";
        const img = document.createElement("img"); img.src = s.url; img.alt = s.name;
        tt.appendChild(img);
        tt.addEventListener("click", () => { picker.remove(); this.sendSticker(s.id, s.url); });
        body.appendChild(tt);
      });
      try {
        const { data: custom } = await supabase.from("stickers")
          .select("id, name, url").order("created_at", { ascending: false });
        (custom || []).forEach(s => {
          const tt = document.createElement("div");
          tt.className = "picker-sticker";
          const img = document.createElement("img"); img.src = s.url; img.alt = s.name;
          tt.appendChild(img);
          tt.addEventListener("click", () => { picker.remove(); this.sendSticker(s.id, s.url); });
          body.appendChild(tt);
        });
      } catch (_) {}
    }
    setTimeout(() => {
      document.addEventListener("click", (ev) => {
        if (!picker.contains(ev.target) && !ev.target.closest("#btn-emoji")) picker.remove();
      }, { once: true });
    }, 0);
  }
  async sendSticker(stickerId, stickerUrl) {
    if (!this.activeChat) return;
    try {
      const payload = {
        chat_id: this.activeChat.id, sender_id: this.user.id,
        content: "", kind: "sticker", sticker_id: stickerId,
        reply_to: this.pendingReplyTo?.id || null,
      };
      if (!stickerId.startsWith("sys-")) payload.attachment_url = stickerUrl;
      const { data, error } = await supabase.from("messages").insert(payload).select().single();
      if (error) throw error;
      if (!this.messages.find(m => m.id === data.id)) {
        this.messages.push(data); this.paintMessageWindow();
      }
      this.hideReplyPreview();
      this.refreshChats();
      Sounds.send();
    } catch (e) { console.error(e); toast("Ошибка стикера", "error"); }
  }

  /* ============================================================
     REALTIME
     ============================================================ */
  subscribeChat(chatId) {
    this.realtimeChannel = supabase.channel("chat:" + chatId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (p) => this.onRealtimeInsert(p.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (p) => this.onRealtimeUpdate(p.new))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (p) => this.onRealtimeDelete(p.old))
      .subscribe();
  }
  subscribeTyping(chatId) {
    if (this.typingChannel) { supabase.removeChannel(this.typingChannel); this.typingChannel = null; }
    this.typingChannel = supabase.channel("typing:" + chatId, { config: { broadcast: { self: false } } });
    this.typingChannel.on("broadcast", { event: "typing" }, (payload) => {
      const { user_id, username } = payload.payload || {};
      if (!user_id || user_id === this.user.id) return;
      if (!this.typingUsers[chatId]) this.typingUsers[chatId] = {};
      this.typingUsers[chatId][user_id] = { name: username || "User", ts: Date.now() };
      this.renderSidebarList();
      clearTimeout(this._typingClear?.[chatId]);
      this._typingClear = this._typingClear || {};
      this._typingClear[chatId] = setTimeout(() => {
        delete this.typingUsers[chatId]?.[user_id];
        this.renderSidebarList();
      }, TYPING_TIMEOUT_MS);
      if (this.activeChat?.id === chatId) this.updateHeaderTyping();
    }).subscribe();
  }
  subscribePolls(chatId) {
    if (this.pollsChannel) { supabase.removeChannel(this.pollsChannel); this.pollsChannel = null; }
    this.pollsChannel = supabase.channel("polls:" + chatId)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, () => this.reloadPollsSafe())
      .on("postgres_changes", { event: "*", schema: "public", table: "polls", filter: `chat_id=eq.${chatId}` }, () => this.reloadPollsSafe())
      .subscribe();
  }
  async reloadPollsSafe() {
    if (!this.activeChat) return;
    await this.loadPolls();
    this.paintMessageWindow();
  }
  broadcastTyping() {
    if (!this.typingChannel || !this.activeChat) return;
    if (this.typingSelfTimeout) return;
    this.typingChannel.send({
      type: "broadcast", event: "typing",
      payload: { user_id: this.user.id, username: this.profile?.username || "User" },
    });
    this.typingSelfTimeout = setTimeout(() => { this.typingSelfTimeout = null; }, 2000);
  }
  updateHeaderTyping() {
    const chat = this.activeChat; if (!chat) return;
    const tt = this.typingUsers[chat.id];
    const typers = tt ? Object.values(tt).filter(x => Date.now() - x.ts < TYPING_TIMEOUT_MS) : [];
    const sub = $("chat-peer-sub");
    if (typers.length) {
      sub.textContent = typers.map(x => x.name).join(", ") + " печатает…";
      sub.classList.add("typing");
    } else {
      const peer = chat.peer;
      if (chat.is_notification) sub.textContent = "Уведомления о входах в аккаунт";
      else if (chat.type === "channel") sub.textContent = `${chat.is_public ? "публичный" : "приватный"} канал · ${chat.members_count || 0} подписчиков`;
      else if (chat.type === "group") sub.textContent = `${chat.is_public ? "публичная" : "приватная"} группа · ${chat.members_count || 0} участников`;
      else if (chat.type === "saved") sub.textContent = "Твои сохранённые сообщения";
      else sub.textContent = peer?.nexora_id || (chat.members_count ? `${chat.members_count} участников` : "");
      sub.classList.remove("typing");
    }
  }
  subscribeProfiles() {
    supabase.channel("profiles-watch")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" },
        (p) => this.onProfileUpdate(p.new))
      .subscribe();
  }
  subscribeGlobalMessages() {
    supabase.channel("global-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        const m = p.new;
        if (!m || m.sender_id === this.user.id) return;
        if (this.activeChat && m.chat_id === this.activeChat.id) return;
        this.refreshChats();
        const chat = this.chats.find(c => c.id === m.chat_id);
        const title = chat?.display_title || "NEXORA";
        this.notify(title, m.content || "Новое сообщение");
        Sounds.message();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads" },
        () => this.loadReadsByOther())
      .subscribe();
  }
  stopRealtime() {
    if (this.realtimeChannel) { supabase.removeChannel(this.realtimeChannel); this.realtimeChannel = null; }
    if (this.typingChannel) { supabase.removeChannel(this.typingChannel); this.typingChannel = null; }
    if (this.pollsChannel) { supabase.removeChannel(this.pollsChannel); this.pollsChannel = null; }
  }
  onRealtimeInsert(m) {
    if (!this.activeChat || m.chat_id !== this.activeChat.id) { this.refreshChats(); return; }
    if (this.messages.find(x => x.id === m.id)) return;
    if (m.sender_id === this.user.id) return;
    this.messages.push(m);
    this.paintMessageWindow();
    this.markChatRead(this.activeChat.id);
    this.refreshChats();
    Sounds.message();
    if (m.kind === "poll") this.reloadPollsSafe();
  }
  onRealtimeUpdate(m) {
    if (!this.activeChat || m.chat_id !== this.activeChat.id) return;
    const i = this.messages.findIndex(x => x.id === m.id);
    if (i >= 0) { this.messages[i] = m; this.paintMessageWindow(); }
  }
  onRealtimeDelete(m) {
    if (!this.activeChat) return;
    this.messages = this.messages.filter(x => x.id !== m.id);
    this.paintMessageWindow();
  }
  onProfileUpdate(p) {
    if (this.activePeer && this.activePeer.id === p.id) {
      Object.assign(this.activePeer, p);
      if (this.activeChat) {
        const badge = this.activeChat.type === "channel" ? "📢 " :
                      this.activeChat.type === "group" ? "👥 " :
                      this.activeChat.type === "saved" ? "⭐ " : "";
        const botTag = this.activePeer.is_bot ? ' <span class="bot-badge">[BOT]</span>' : "";
        $("chat-peer-name").innerHTML = `${escapeHtml(badge + (this.activeChat.display_title || p.username))}${botTag}
          <span class="online-dot${this.isPeerOnline(this.activeChat) ? " online" : ""}"></span>`;
      }
    }
    const c = this.contacts.find(c => c.id === p.id);
    if (c) Object.assign(c, p);
    this.chats.forEach(ch => { if (ch.peer?.id === p.id) Object.assign(ch.peer, p); });
    if (this.activeTab === "chats" || this.activeTab === "contacts") this.renderSidebarList();
  }
  startPolling(chatId) {
    this.stopPolling();
    let lastIso = this.messages.length ? this.messages[this.messages.length - 1].created_at : new Date().toISOString();
    this.pollTimer = setInterval(async () => {
      if (!this.activeChat || this.activeChat.id !== chatId) return;
      try {
        const { data } = await supabase.from("messages")
          .select("*").eq("chat_id", chatId).gt("created_at", lastIso)
          .order("created_at", { ascending: true });
        if (data && data.length) {
          data.forEach(m => { if (!this.messages.find(x => x.id === m.id)) this.messages.push(m); });
          lastIso = data[data.length - 1].created_at;
          this.paintMessageWindow();
        }
      } catch (_) {}
    }, POLL_MS);
  }
  stopPolling() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } }

  /* ============================================================
     CHANNEL / GROUP SETTINGS
     ============================================================ */
  openChannelSettings(chat) {
    this.openModal({
      title: "Настройки канала",
      body: (body) => {
        const isPublic = !!chat.is_public;
        body.innerHTML = `
          <div class="settings-section">
            <h3>${t("name")}</h3>
            <input id="cs-title" maxlength="80" value="${escapeHtml(chat.title || "")}">
            <textarea id="cs-desc" rows="2" maxlength="200" placeholder="${t("description")}" style="margin-top:8px">${escapeHtml(chat.description || "")}</textarea>
          </div>
          <div class="settings-section">
            <h3>Тип канала</h3>
            <div id="cs-type" style="display:flex;gap:8px"></div>
            <div id="cs-username-wrap" style="margin-top:12px; display:${isPublic ? "block" : "none"}">
              <label style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:1px">${t("username")}</label>
              <div class="input-prefix" style="margin-top:6px">
                <span class="prefix">@</span>
                <input id="cs-username" maxlength="32" value="${escapeHtml(chat.username || "")}" placeholder="my_channel">
              </div>
              <small style="display:block;margin-top:6px;color:var(--text-3);font-size:11px">5–32 символа, латиница, цифры, _. Пользователи смогут найти канал по @username.</small>
            </div>
          </div>
          <div class="settings-section">
            <h3>Ссылка-приглашение</h3>
            <div id="cs-invite-info" style="color:var(--text-2);font-size:13px"></div>
            <div class="share-row" id="cs-share-row" style="display:none">
              <span class="share-link" id="cs-share-link"></span>
              <button class="btn btn-ghost" id="cs-copy">Копировать</button>
            </div>
          </div>
          <div id="cs-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="cs-cancel">${t("cancel")}</button>
            <button class="btn btn-primary" id="cs-save">${t("save")}</button>
          </div>`;
        let picked = isPublic;
        const typeBox = body.querySelector("#cs-type");
        const unameWrap = body.querySelector("#cs-username-wrap");
        const inviteInfo = body.querySelector("#cs-invite-info");
        const shareRow = body.querySelector("#cs-share-row");
        const shareLink = body.querySelector("#cs-share-link");
        const setType = (pub) => {
          picked = pub;
          typeBox.querySelectorAll("button").forEach(b => b.className = "btn btn-ghost");
          (pub ? typeBox.children[0] : typeBox.children[1]).className = "btn btn-primary";
          unameWrap.style.display = pub ? "block" : "none";
          refreshInvite();
        };
        [t("public"), t("private")].forEach((label, i) => {
          const b = document.createElement("button");
          b.className = "btn " + ((isPublic && i === 0) || (!isPublic && i === 1) ? "btn-primary" : "btn-ghost");
          b.textContent = label;
          b.addEventListener("click", () => setType(i === 0));
          typeBox.appendChild(b);
        });
        function refreshInvite() {
          if (picked) {
            inviteInfo.textContent = "Публичный канал — ссылка формируется по @username.";
            shareRow.style.display = "none";
          } else {
            inviteInfo.textContent = "Приватный канал — присоединиться можно только по ссылке.";
            shareRow.style.display = "flex";
            shareLink.textContent = chat.invite_token
              ? `${location.origin}${location.pathname}?c=${chat.invite_token}`
              : "Ссылка появится после первого сохранения";
          }
        }
        refreshInvite();
        body.querySelector("#cs-copy").addEventListener("click", () => {
          navigator.clipboard.writeText(shareLink.textContent);
          toast("Ссылка скопирована", "success");
        });
        body.querySelector("#cs-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#cs-save").addEventListener("click", async () => {
          const errEl = body.querySelector("#cs-error");
          errEl.classList.remove("show");
          const title = body.querySelector("#cs-title").value.trim();
          const desc = body.querySelector("#cs-desc").value.trim();
          const uname = body.querySelector("#cs-username").value.trim().toLowerCase();
          if (!title) { errEl.textContent = "Введите название"; errEl.classList.add("show"); return; }
          if (picked && !/^[a-z][a-z0-9_]{4,31}$/.test(uname)) {
            errEl.textContent = "Username: 5–32, начинается с буквы, a-z, 0-9, _";
            errEl.classList.add("show"); return;
          }
          try {
            const { error } = await supabase.rpc("update_channel_settings", {
              p_chat_id: chat.id, p_is_public: picked,
              p_username: picked ? uname : null,
              p_title: title, p_description: desc,
            });
            if (error) throw error;
            toast("Настройки сохранены", "success");
            Sounds.success();
            this.closeModal();
            await this.refreshChats();
          } catch (e) { errEl.textContent = e.message || "Ошибка"; errEl.classList.add("show"); }
        });
      },
    });
  }
  openGroupSettings(chat) {
    this.openModal({
      title: "Настройки группы",
      body: (body) => {
        const isPublic = !!chat.is_public;
        body.innerHTML = `
          <div class="settings-section">
            <h3>${t("name")}</h3>
            <input id="gs-title" maxlength="80" value="${escapeHtml(chat.title || "")}">
            <textarea id="gs-desc" rows="2" maxlength="200" placeholder="${t("description")}" style="margin-top:8px">${escapeHtml(chat.description || "")}</textarea>
          </div>
          <div class="settings-section">
            <h3>Тип группы</h3>
            <div id="gs-type" style="display:flex;gap:8px"></div>
            <div id="gs-username-wrap" style="margin-top:12px; display:${isPublic ? "block" : "none"}">
              <label style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:1px">${t("username")}</label>
              <div class="input-prefix" style="margin-top:6px">
                <span class="prefix">@</span>
                <input id="gs-username" maxlength="32" value="${escapeHtml(chat.username || "")}" placeholder="my_group">
              </div>
              <small style="display:block;margin-top:6px;color:var(--text-3);font-size:11px">5–32 символа, латиница, цифры, _. Люди смогут найти группу по @username.</small>
            </div>
          </div>
          <div class="settings-section">
            <h3>Ссылка-приглашение</h3>
            <div id="gs-invite-info" style="color:var(--text-2);font-size:13px"></div>
            <div class="share-row" id="gs-share-row" style="display:none">
              <span class="share-link" id="gs-share-link"></span>
              <button class="btn btn-ghost" id="gs-copy">Копировать</button>
            </div>
          </div>
          <div id="gs-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="gs-cancel">${t("cancel")}</button>
            <button class="btn btn-primary" id="gs-save">${t("save")}</button>
          </div>`;
        let picked = isPublic;
        const typeBox = body.querySelector("#gs-type");
        const unameWrap = body.querySelector("#gs-username-wrap");
        const inviteInfo = body.querySelector("#gs-invite-info");
        const shareRow = body.querySelector("#gs-share-row");
        const shareLink = body.querySelector("#gs-share-link");
        const setType = (pub) => {
          picked = pub;
          typeBox.querySelectorAll("button").forEach(b => b.className = "btn btn-ghost");
          (pub ? typeBox.children[0] : typeBox.children[1]).className = "btn btn-primary";
          unameWrap.style.display = pub ? "block" : "none";
          refreshInvite();
        };
        ["Публичная", "Приватная"].forEach((label, i) => {
          const b = document.createElement("button");
          b.className = "btn " + ((isPublic && i === 0) || (!isPublic && i === 1) ? "btn-primary" : "btn-ghost");
          b.textContent = label;
          b.addEventListener("click", () => setType(i === 0));
          typeBox.appendChild(b);
        });
        function refreshInvite() {
          if (picked) {
            inviteInfo.textContent = "Публичная группа — ссылка формируется по @username.";
            shareRow.style.display = "none";
          } else {
            inviteInfo.textContent = "Приватная группа — присоединиться можно только по ссылке.";
            shareRow.style.display = "flex";
            shareLink.textContent = chat.invite_token
              ? `${location.origin}${location.pathname}?c=${chat.invite_token}`
              : "Ссылка появится после первого сохранения";
          }
        }
        refreshInvite();
        body.querySelector("#gs-copy").addEventListener("click", () => {
          navigator.clipboard.writeText(shareLink.textContent);
          toast("Ссылка скопирована", "success");
        });
        body.querySelector("#gs-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#gs-save").addEventListener("click", async () => {
          const errEl = body.querySelector("#gs-error");
          errEl.classList.remove("show");
          const title = body.querySelector("#gs-title").value.trim();
          const desc = body.querySelector("#gs-desc").value.trim();
          const uname = body.querySelector("#gs-username").value.trim().toLowerCase();
          if (!title) { errEl.textContent = "Введите название"; errEl.classList.add("show"); return; }
          if (picked && !/^[a-z][a-z0-9_]{4,31}$/.test(uname)) {
            errEl.textContent = "Username: 5–32, начинается с буквы, a-z, 0-9, _";
            errEl.classList.add("show"); return;
          }
          try {
            const { error } = await supabase.rpc("update_group_settings", {
              p_chat_id: chat.id, p_title: title, p_description: desc,
              p_is_public: picked, p_username: picked ? uname : null,
            });
            if (error) throw error;
            toast("Настройки сохранены", "success");
            Sounds.success();
            this.closeModal();
            await this.refreshChats();
          } catch (e) { errEl.textContent = e.message || "Ошибка"; errEl.classList.add("show"); }
        });
      },
    });
  }
  openChannelShare(chat) {
    const url = chat.is_public && chat.username
      ? `${location.origin}${location.pathname}?c=${chat.username}`
      : chat.invite_token
        ? `${location.origin}${location.pathname}?c=${chat.invite_token}`
        : "Ссылка появится после первого сохранения";
    this.openModal({
      title: "Поделиться",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">
            ${chat.is_public
              ? `Публичный — любой найдёт по @${escapeHtml(chat.username || "")}.`
              : "Приватный — только по этой ссылке."}
          </p>
          <div class="share-row">
            <span class="share-link" id="ch-share">${escapeHtml(url)}</span>
          </div>`;
        body.querySelector("#ch-share").addEventListener("click", () => {
          navigator.clipboard.writeText(url);
          toast("Скопировано", "success");
        });
        const f = this._openModal.footerEl;
        f.innerHTML = "";
        const copy = document.createElement("button");
        copy.className = "btn btn-primary"; copy.textContent = "Копировать ссылку";
        copy.addEventListener("click", () => {
          navigator.clipboard.writeText(url);
          toast("Скопировано", "success");
          Sounds.success();
        });
        f.appendChild(copy);
      },
    });
  }

  /* ============================================================
     DEEP LINKS
     ============================================================ */
  async handleDeepLink() {
    try {
      const params = new URLSearchParams(location.search);
      const chan = params.get("c");
      const usr = params.get("u");
      const chat = params.get("chat");
      const msg = params.get("msg");

      if (chat && msg) {
        await this.openMessageFromLink(chat, msg);
        return;
      }

      if (chan) {
        const ch = await this.tryFindChannel(chan.replace(/^@/, ""));
        if (ch) {
          if (ch.already_member) {
            await this.openChatById(ch.id);
          } else if (ch.is_public) {
            if (confirm(`Присоединиться к «${ch.title}»?`)) {
              try {
                await supabase.rpc("join_channel", { p_chat_id: ch.id });
                await this.refreshChats();
                await this.openChatById(ch.id);
                toast("Присоединились", "success");
              } catch (e) { toast(e.message || "Ошибка", "error"); }
            }
          } else {
            if (confirm(`Присоединиться к приватному «${ch.title}»?`)) {
              try {
                await supabase.from("chat_members").insert({
                  chat_id: ch.id, user_id: this.user.id, role: "member",
                });
                await this.refreshChats();
                await this.openChatById(ch.id);
                toast("Присоединились", "success");
              } catch (e) { toast(e.message || "Ошибка", "error"); }
            }
          }
        } else {
          toast("Канал не найден", "warning");
        }
      }

      if (usr) {
        const { data } = await supabase.rpc("search_user", { query: usr });
        const u = Array.isArray(data) ? data[0] : null;
        if (u && u.id !== this.user.id) this.openUserProfile(u.id, u);
      }
    } catch (_) {}
  }
  async copyMessageLink(msg) {
    try {
      const url = `${location.origin}${location.pathname}?chat=${this.activeChat.id}&msg=${msg.id}`;
      await navigator.clipboard.writeText(url);
      toast("Ссылка на сообщение скопирована", "success");
      Sounds.success();
    } catch (e) { toast("Не удалось скопировать", "error"); }
  }
  async openMessageFromLink(chatId, msgId) {
    await this.openChatById(chatId);
    setTimeout(() => {
      const el = document.querySelector(`[data-message-id="${msgId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("msg-link-highlight");
        setTimeout(() => el.classList.remove("msg-link-highlight"), 2500);
      }
    }, 400);
  }

  /* ============================================================
     COMMENTS
     ============================================================ */
  openCommentsFor(msg) {
    this.openModal({
      title: t("comments"),
      body: async (body) => {
        body.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
        let comments = [];
        try {
          const { data } = await supabase
            .from("messages").select("id, sender_id, content, created_at")
            .eq("channel_post_id", msg.id)
            .order("created_at", { ascending: true }).limit(200);
          comments = data || [];
        } catch (_) {}
        body.innerHTML = "";
        if (!comments.length) {
          body.innerHTML = `<p class="muted">Комментариев пока нет. Будь первым!</p>`;
        } else {
          comments.forEach(c => {
            const sender = this.members.find(x => x.user_id === c.sender_id);
            const name = c.sender_id === this.user.id ? "Ты" : (sender?.username || "User");
            const row = document.createElement("div");
            row.className = "comment-row";
            row.innerHTML = `
              <div class="comment-author">${escapeHtml(name)}
                <span class="comment-time">${escapeHtml(formatTime(c.created_at))}</span>
              </div>
              <div class="comment-body">${renderMarkdown(c.content)}</div>`;
            body.appendChild(row);
          });
        }
        const input = document.createElement("input");
        input.placeholder = "Написать комментарий…";
        input.style.marginTop = "14px";
        const send = document.createElement("button");
        send.className = "btn btn-primary";
        send.textContent = t("send");
        send.style.marginTop = "8px";
        send.style.width = "100%";
        send.addEventListener("click", async () => {
          const text = input.value.trim();
          if (!text) return;
          try {
            const { data, error } = await supabase.from("messages").insert({
              chat_id: this.activeChat.id,
              sender_id: this.user.id,
              content: text, kind: "text",
              channel_post_id: msg.id,
            }).select().single();
            if (error) throw error;
            input.value = "";
            toast("Комментарий добавлен", "success");
            const newRow = document.createElement("div");
            newRow.className = "comment-row";
            newRow.innerHTML = `
              <div class="comment-author">Ты
                <span class="comment-time">${escapeHtml(formatTime(data.created_at))}</span>
              </div>
              <div class="comment-body">${renderMarkdown(text)}</div>`;
            body.insertBefore(newRow, input);
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
        body.appendChild(input);
        body.appendChild(send);
      },
    });
  }

  /* ============================================================
     LOCAL ROOMS
     ============================================================ */
  async openLocalRoomsDialog() {
    if (!navigator.geolocation) return toast("Геолокация не поддерживается", "error");
    toast("Определяем местоположение…", "info");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let rooms = [];
        try {
          const { data, error } = await supabase.rpc("find_local_rooms", {
            p_lat: lat, p_lng: lng, p_limit: 30,
          });
          if (error) throw error;
          rooms = data || [];
        } catch (_) {}
        this.openModal({
          title: t("localRooms"),
          body: (body) => {
            body.innerHTML = `
              <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">
                Комнаты рядом с вами.
              </p>
              <div style="display:flex;gap:8px;margin-bottom:14px">
                <button class="btn btn-primary" id="lr-create-btn" style="flex:1">📍 Создать</button>
                <button class="btn btn-ghost" id="lr-refresh-btn">🔄</button>
              </div>
              <div id="lr-list"></div>`;
            const list = body.querySelector("#lr-list");
            if (!rooms.length) {
              list.innerHTML = `<div class="empty-state">Рядом пока никого.</div>`;
            } else {
              rooms.forEach(r => {
                const card = document.createElement("div");
                card.className = "local-room-card";
                card.innerHTML = `
                  <div class="local-room-icon">📍</div>
                  <div class="local-room-body">
                    <div class="local-room-title">${escapeHtml(r.name)}</div>
                    <div class="local-room-meta">
                      ${Math.round(r.distance_m)} м · ${r.members_count} участников
                    </div>
                  </div>`;
                card.addEventListener("click", async () => {
                  try {
                    await supabase.from("chat_members").insert({
                      chat_id: r.chat_id, user_id: this.user.id, role: "member",
                    });
                  } catch (_) {}
                  this.closeModal();
                  await this.refreshChats();
                  await this.openChatById(r.chat_id);
                });
                list.appendChild(card);
              });
            }
            body.querySelector("#lr-create-btn").addEventListener("click", () => {
              this.closeModal();
              setTimeout(() => this.openCreateLocalRoomDialog(lat, lng), 100);
            });
            body.querySelector("#lr-refresh-btn").addEventListener("click", () => {
              this.closeModal();
              setTimeout(() => this.openLocalRoomsDialog(), 100);
            });
          },
        });
      },
      (err) => toast("Не удалось определить местоположение", "error")
    );
  }
  openCreateLocalRoomDialog(lat, lng) {
    this.openModal({
      title: t("createLocalRoom"),
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <div class="form-group"><label>Название</label>
            <input id="lr-name" maxlength="60" placeholder="Концерт, Кафе">
          </div>
          <div class="form-group"><label>${t("radius")}</label>
            <input id="lr-radius" type="number" min="50" max="5000" value="500">
          </div>
          <div class="form-group"><label>${t("ttl")}</label>
            <input id="lr-ttl" type="number" min="5" max="1440" value="120">
          </div>
          <div id="lr-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="lr-cancel">${t("cancel")}</button>
            <button class="btn btn-primary" id="lr-create">${t("create")}</button>
          </div>`;
        body.querySelector("#lr-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#lr-create").addEventListener("click", async () => {
          const name = body.querySelector("#lr-name").value.trim();
          const radius = parseInt(body.querySelector("#lr-radius").value, 10);
          const ttl = parseInt(body.querySelector("#lr-ttl").value, 10);
          const errEl = body.querySelector("#lr-error");
          errEl.classList.remove("show");
          if (!name) { errEl.textContent = "Введи название"; errEl.classList.add("show"); return; }
          try {
            const { data, error } = await supabase.rpc("create_local_room", {
              p_name: name, p_lat: lat, p_lng: lng,
              p_radius_m: radius, p_ttl_minutes: ttl,
            });
            if (error) throw error;
            const { data: roomRow } = await supabase
              .from("local_rooms").select("chat_id").eq("id", data).single();
            if (roomRow) {
              await supabase.from("chat_members").insert({
                chat_id: roomRow.chat_id, user_id: this.user.id, role: "owner",
              });
              this.closeModal();
              await this.refreshChats();
              await this.openChatById(roomRow.chat_id);
            }
            toast("Локальная комната создана", "success");
            Sounds.success();
          } catch (e) { errEl.textContent = e.message || "Ошибка"; errEl.classList.add("show"); }
        });
      },
    });
  }

  /* ============================================================
     EPHEMERAL CHAT
     ============================================================ */
  openEphemeralDialog() {
    this.openModal({
      title: t("createEphemeral"),
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">
            Чат и все его сообщения удалятся через указанное время.
          </p>
          <div class="form-group"><label>Название</label>
            <input id="eph-title" maxlength="60" placeholder="Секретный чат">
          </div>
          <div class="form-group"><label>${t("ttl")}</label>
            <input id="eph-ttl" type="number" min="5" max="10080" value="60">
          </div>
          <div id="eph-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="eph-cancel">${t("cancel")}</button>
            <button class="btn btn-primary" id="eph-create">${t("create")}</button>
          </div>`;
        body.querySelector("#eph-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#eph-create").addEventListener("click", async () => {
          const title = body.querySelector("#eph-title").value.trim();
          const ttl = parseInt(body.querySelector("#eph-ttl").value, 10);
          const errEl = body.querySelector("#eph-error");
          errEl.classList.remove("show");
          if (!ttl || ttl < 5) { errEl.textContent = "Минимум 5 минут"; errEl.classList.add("show"); return; }
          try {
            const { data, error } = await supabase.rpc("create_ephemeral_chat", {
              p_title: title || "Исчезающий чат", p_ttl_minutes: ttl,
            });
            if (error) throw error;
            toast("Исчезающий чат создан", "success");
            Sounds.success();
            this.closeModal();
            await this.refreshChats();
            await this.openChatById(data);
          } catch (e) { errEl.textContent = e.message || "Ошибка"; errEl.classList.add("show"); }
        });
      },
    });
  }

  /* ============================================================
     CATALOG
     ============================================================ */
  async openChannelCatalog() {
    let channels = [];
    try {
      const { data } = await supabase.from("chats")
        .select("id, title, description, avatar_url, username, is_public")
        .eq("type", "channel").eq("is_public", true)
        .not("username", "is", null)
        .order("updated_at", { ascending: false }).limit(100);
      channels = data || [];
    } catch (_) {}
    this.openModal({
      title: t("catalog"),
      wide: true,
      body: (body) => {
        if (!channels.length) {
          body.innerHTML = `<div class="empty-state">Пока нет публичных каналов.</div>`;
          return;
        }
        body.innerHTML = "";
        channels.forEach(c => {
          const card = document.createElement("div");
          card.className = "catalog-card";
          card.innerHTML = `
            <div class="catalog-avatar">📢</div>
            <div class="catalog-body">
              <div class="catalog-title">${escapeHtml(c.title || "")}
                <span class="channel-badge public">public</span>
              </div>
              <div class="catalog-meta">@${escapeHtml(c.username)} · ${escapeHtml((c.description || "").slice(0, 60))}</div>
            </div>`;
          card.addEventListener("click", async () => {
            this.closeModal();
            await this.searchChannel(c.username);
          });
          body.appendChild(card);
        });
      },
    });
  }

  /* ============================================================
     EMOJI PACKS
     ============================================================ */
  async openEmojiPacksManager() {
    let packs = [];
    try {
      const { data } = await supabase.from("emoji_packs")
        .select("id, name, is_public, created_at")
        .eq("owner_id", this.user.id).order("created_at", { ascending: false });
      packs = data || [];
    } catch (_) {}
    this.openModal({
      title: t("emojiPacks"),
      wide: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">
            Создавай свои эмодзи. В сообщениях работают как :shortcode:
          </p>
          <button class="btn btn-primary btn-block" id="ep-new" style="margin-bottom:14px">
            ＋ ${t("createPack")}
          </button>
          <div id="ep-list"></div>`;
        const list = body.querySelector("#ep-list");
        if (!packs.length) {
          list.innerHTML = `<div class="empty-state">Пока нет паков.</div>`;
        } else {
          packs.forEach(p => {
            const row = document.createElement("div");
            row.className = "settings-row";
            row.innerHTML = `<div class="settings-row-info">
              <div class="settings-row-label">${escapeHtml(p.name)}</div>
              <div class="settings-row-desc">${p.is_public ? "публичный" : "приватный"}</div>
            </div>`;
            const openBtn = document.createElement("button");
            openBtn.className = "btn btn-ghost";
            openBtn.textContent = "Открыть";
            openBtn.addEventListener("click", () => {
              this.closeModal();
              setTimeout(() => this.openPackEditor(p), 100);
            });
            row.appendChild(openBtn);
            list.appendChild(row);
          });
        }
        body.querySelector("#ep-new").addEventListener("click", () => {
          this.closeModal();
          setTimeout(() => this.openCreatePackDialog(), 100);
        });
      },
    });
  }
  openCreatePackDialog() {
    this.openModal({
      title: t("createPack"),
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <div class="form-group"><label>Название пака</label>
            <input id="ep-name" maxlength="40" placeholder="Мои коты">
          </div>
          <label style="display:flex;gap:10px;align-items:center;cursor:pointer;padding:6px 0">
            <input type="checkbox" id="ep-public" style="width:auto" checked>
            <span>Публичный пак</span>
          </label>
          <div id="ep-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="ep-cancel">${t("cancel")}</button>
            <button class="btn btn-primary" id="ep-create">${t("create")}</button>
          </div>`;
        body.querySelector("#ep-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#ep-create").addEventListener("click", async () => {
          const name = body.querySelector("#ep-name").value.trim();
          const isPublic = body.querySelector("#ep-public").checked;
          const errEl = body.querySelector("#ep-error");
          errEl.classList.remove("show");
          if (!name) { errEl.textContent = "Введи название"; errEl.classList.add("show"); return; }
          try {
            const { data, error } = await supabase.from("emoji_packs").insert({
              owner_id: this.user.id, name, is_public: isPublic,
            }).select().single();
            if (error) throw error;
            toast("Пак создан", "success");
            Sounds.success();
            this.closeModal();
            setTimeout(() => this.openPackEditor(data), 100);
          } catch (e) { errEl.textContent = e.message || "Ошибка"; errEl.classList.add("show"); }
        });
      },
    });
  }
  async openPackEditor(pack) {
    let emojis = [];
    try {
      const { data } = await supabase.from("custom_emojis")
        .select("id, shortcode, url")
        .eq("pack_id", pack.id).order("created_at", { ascending: true });
      emojis = data || [];
    } catch (_) {}
    this.openModal({
      title: `Пак: ${pack.name}`,
      wide: true,
      body: (body) => {
        body.innerHTML = `
          <div style="display:flex;gap:8px;margin-bottom:14px">
            <button class="btn btn-primary" id="ce-add">＋ ${t("uploadEmoji")}</button>
          </div>
          <div id="ce-list" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px"></div>`;
        const list = body.querySelector("#ce-list");
        const renderList = (items) => {
          list.innerHTML = "";
          if (!items.length) {
            list.innerHTML = `<div class="empty-state" style="grid-column:1/-1">Пак пуст.</div>`;
            return;
          }
          items.forEach(e => {
            const tile = document.createElement("div");
            tile.style.cssText = "position:relative;aspect-ratio:1;background:var(--bg-2);border-radius:12px;padding:8px;display:flex;align-items:center;justify-content:center";
            const img = document.createElement("img");
            img.src = e.url;
            img.style.cssText = "width:100%;height:100%;object-fit:contain";
            tile.appendChild(img);
            const code = document.createElement("div");
            code.textContent = `:${e.shortcode}:`;
            code.style.cssText = "position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--text-3);white-space:nowrap";
            tile.appendChild(code);
            const del = document.createElement("button");
            del.textContent = "✕";
            del.style.cssText = "position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(255,90,110,0.85);color:#fff;font-size:11px";
            del.addEventListener("click", async () => {
              if (!confirm("Удалить?")) return;
              await supabase.from("custom_emojis").delete().eq("id", e.id);
              emojis = emojis.filter(x => x.id !== e.id);
              renderList(emojis);
            });
            tile.appendChild(del);
            list.appendChild(tile);
          });
        };
        renderList(emojis);
        body.querySelector("#ce-add").addEventListener("click", () => {
          const inp = document.createElement("input");
          inp.type = "file";
          inp.accept = "image/*";
          inp.addEventListener("change", async () => {
            const f = inp.files[0];
            if (!f) return;
            if (f.size > STICKER_MAX) return toast("Максимум 2 MB", "warning");
            const shortcode = (prompt("Короткий код:", f.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "")) || "").trim();
            if (!shortcode) return;
            try {
              const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(0, 60);
              const path = `${this.user.id}/emoji-${pack.id}-${Date.now()}-${safe}`;
              const { error: upErr } = await supabase.storage
                .from(STICKER_BUCKET)
                .upload(path, f, { contentType: f.type, upsert: false });
              if (upErr) throw upErr;
              const { data: pub } = supabase.storage.from(STICKER_BUCKET).getPublicUrl(path);
              const { data: row, error } = await supabase.from("custom_emojis").insert({
                pack_id: pack.id, shortcode: shortcode, url: pub.publicUrl,
              }).select().single();
              if (error) throw error;
              emojis.push(row);
              renderList(emojis);
              toast("Эмодзи добавлен", "success");
            } catch (e) { toast(e.message || "Ошибка", "error"); }
          });
          inp.click();
        });
      },
    });
  }

  /* ============================================================
     ACTIVITY
     ============================================================ */
  openActivityDialog() {
    this.openModal({
      title: t("activity"),
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">
            Короткий текст рядом с твоим именем.
          </p>
          <input id="act-input" maxlength="60" value="${escapeHtml(this.profile.activity_text || "")}" placeholder="💻 работаю над кодом">
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="act-cancel">${t("cancel")}</button>
            <button class="btn btn-primary" id="act-save">${t("save")}</button>
          </div>`;
        body.querySelector("#act-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#act-save").addEventListener("click", async () => {
          const text = body.querySelector("#act-input").value.trim().slice(0, 60);
          try {
            await this.updateProfile({ activity_text: text });
            this.profile.activity_text = text;
            toast("Активность обновлена", "success");
            Sounds.success();
            this.closeModal();
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
      },
    });
  }

  /* ============================================================
     COVER PICKER
     ============================================================ */
  openCoverPicker() {
    const presets = [
      { id: "gradient-1", cls: "cover-gradient-1", label: "Gradient 1" },
      { id: "gradient-2", cls: "cover-gradient-2", label: "Gradient 2" },
      { id: "gradient-3", cls: "cover-gradient-3", label: "Gradient 3" },
      { id: "gradient-4", cls: "cover-gradient-4", label: "Gradient 4" },
      { id: "gradient-5", cls: "cover-gradient-5", label: "Gradient 5" },
      { id: "particles",  cls: "cover-gradient-1 particles", label: "Particles" },
      { id: "waves",      cls: "waves", label: "Waves" },
    ];
    this.openModal({
      title: t("virtualCover"),
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">
            Виртуальные обложки. Не требуют загрузки картинки.
          </p>
          <div class="cover-grid" id="cover-grid"></div>
          <button class="btn btn-ghost btn-block" id="cover-upload" style="margin-top:14px">📷 Загрузить свою</button>
          <button class="btn btn-ghost btn-block" id="cover-clear" style="margin-top:8px">🚫 Убрать обложку</button>`;
        const grid = body.querySelector("#cover-grid");
        presets.forEach(p => {
          const b = document.createElement("button");
          b.className = p.cls;
          if (this.profile.cover_preset === p.id) b.classList.add("selected");
          b.title = p.label;
          b.addEventListener("click", async () => {
            try {
              await this.updateProfile({ cover_preset: p.id, cover_url: null });
              this.profile.cover_preset = p.id;
              this.profile.cover_url = null;
              toast("Обложка обновлена", "success");
              Sounds.success();
              this.closeModal();
            } catch (e) { toast(e.message || "Ошибка", "error"); }
          });
          grid.appendChild(b);
        });
        body.querySelector("#cover-upload").addEventListener("click", () => {
          this.closeModal();
          $("file-cover").click();
        });
        body.querySelector("#cover-clear").addEventListener("click", async () => {
          try {
            await this.updateProfile({ cover_preset: null, cover_url: null });
            this.profile.cover_preset = null;
            this.profile.cover_url = null;
            toast("Обложка убрана", "warning");
            this.closeModal();
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
      },
    });
  }

  /* ============================================================
     SETTINGS
     ============================================================ */
  openSettings() {
    this.openModal({
      title: t("settings"),
      wide: true,
      body: (body) => {
        body.appendChild(this.section("👤 " + t("account"), [
          this.row(t("username"), this.profile.username, () => this.changeUsername()),
          this.row("NEXORA ID", this.profile.nexora_id, () => {
            navigator.clipboard.writeText(this.profile.nexora_id);
            toast("ID скопирован", "success");
            Sounds.click();
          }, "Copy"),
          this.row(t("accounts"), "Переключение", () => {
            this.closeModal();
            setTimeout(() => this.openAccountsSwitcher(), 100);
          }, t("open")),
        ]));

        body.appendChild(this.section("🔒 " + t("security"), [
          this.row(t("password"), t("changePassword"), () => this.changePassword()),
          this.row("2FA", t("twoFALabel"), () => this.toggle2FA()),
          this.row(t("sessions"), "Активные устройства", () => {
            this.closeModal();
            setTimeout(() => this.openSessionsDialog(), 100);
          }, t("open")),
        ]));

        // Профиль-кастомизация
        const profileSec = document.createElement("div");
        profileSec.className = "settings-section";
        profileSec.innerHTML = `<h3>🎨 Профиль</h3>`;
        profileSec.appendChild(this.row("Обложка", "Виртуальная или своя", () => {
          this.closeModal();
          setTimeout(() => this.openCoverPicker(), 100);
        }, t("open")));
        profileSec.appendChild(this.row(t("activity"), this.profile.activity_text || "не задана", () => {
          this.closeModal();
          setTimeout(() => this.openActivityDialog(), 100);
        }, t("edit")));
        body.appendChild(profileSec);

        // Уведомления
        const notif = document.createElement("div");
        notif.className = "settings-section";
        notif.innerHTML = `<h3>🔔 ${t("notifications")}</h3>`;
        const notifRow = document.createElement("div");
        notifRow.className = "settings-row";
        notifRow.innerHTML = `<div class="settings-row-info">
          <div class="settings-row-label">${t("browserNotif")}</div>
          <div class="settings-row-desc" id="notif-status">${Notification.permission}</div>
        </div>`;
        const notifBtn = document.createElement("button");
        notifBtn.className = "btn btn-ghost";
        notifBtn.textContent = "Разрешить";
        notifBtn.addEventListener("click", async () => {
          const ok = await this.requestNotificationPermission();
          notifRow.querySelector("#notif-status").textContent = Notification.permission;
          toast(ok ? "Включено" : "Не разрешено", ok ? "success" : "warning");
        });
        notifRow.appendChild(notifBtn);
        notif.appendChild(notifRow);

        const soundRow = document.createElement("div");
        soundRow.className = "settings-row";
        soundRow.innerHTML = `<div class="settings-row-info">
          <div class="settings-row-label">${t("sound")}</div>
          <div class="settings-row-desc">${t("soundDesc")}</div>
        </div>`;
        const sw = document.createElement("div");
        sw.className = "switch" + (Sounds.enabled ? " on" : "");
        sw.addEventListener("click", () => {
          const on = Sounds.toggle();
          sw.classList.toggle("on", on);
          toast(on ? "Звук включён" : "Звук выключен", "success");
        });
        soundRow.appendChild(sw);
        notif.appendChild(soundRow);

        const testBtn = document.createElement("button");
        testBtn.className = "btn btn-ghost";
        testBtn.textContent = "🔊 " + t("testSound");
        testBtn.style.marginTop = "10px";
        testBtn.addEventListener("click", () => Sounds.message());
        notif.appendChild(testBtn);
        body.appendChild(notif);

        // Внешний вид
        const appearance = document.createElement("div");
        appearance.className = "settings-section";
        appearance.innerHTML = `<h3>🎨 ${t("appearance")}</h3>`;

        // Тема профиля
        const themeRow = document.createElement("div");
        themeRow.className = "settings-row";
        themeRow.innerHTML = `<div class="settings-row-info">
          <div class="settings-row-label">${t("profileTheme")}</div>
          <div class="settings-row-desc">${escapeHtml(PROFILE_THEMES[getProfileTheme()]?.name || "NEXORA Dark")}</div>
        </div>`;
        const themeBtn = document.createElement("button");
        themeBtn.className = "btn btn-ghost";
        themeBtn.textContent = t("edit");
        themeBtn.addEventListener("click", () => {
          this.closeModal();
          setTimeout(() => this.openProfileThemePicker(), 100);
        });
        themeRow.appendChild(themeBtn);
        appearance.appendChild(themeRow);

        // Язык
        const langRow = document.createElement("div");
        langRow.className = "settings-row";
        langRow.innerHTML = `<div class="settings-row-info">
          <div class="settings-row-label">${t("language")}</div>
          <div class="settings-row-desc">${escapeHtml(LOCALES[currentLocale()] || "Русский")}</div>
        </div>`;
        const langBtn = document.createElement("button");
        langBtn.className = "btn btn-ghost";
        langBtn.textContent = t("edit");
        langBtn.addEventListener("click", () => {
          this.closeModal();
          setTimeout(() => this.openLanguageDialog(), 100);
        });
        langRow.appendChild(langBtn);
        appearance.appendChild(langRow);
        body.appendChild(appearance);

        // Приватность
        const privacy = document.createElement("div");
        privacy.className = "settings-section";
        privacy.innerHTML = `<h3>🛡 ${t("privacy")}</h3>`;
        privacy.appendChild(this.toggleRow(t("showOnline"), this.profile.show_online, (v) => {
          this.updateProfile({ show_online: v }).then(() => toast("Сохранено", "success"));
        }));
        privacy.appendChild(this.toggleRow(t("findable"), this.profile.findable, (v) => {
          this.updateProfile({ findable: v }).then(() => toast("Сохранено", "success"));
        }));
        body.appendChild(privacy);

        // Боты
        const botsSec = document.createElement("div");
        botsSec.className = "settings-section";
        botsSec.innerHTML = `<h3>🤖 ${t("bots")}</h3>
          <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">${t("botsHint")}</p>`;
        const myBotsBtn = document.createElement("button");
        myBotsBtn.className = "btn btn-primary";
        myBotsBtn.textContent = t("myBots");
        myBotsBtn.addEventListener("click", () => { this.closeModal(); this.openMyBots(); });
        botsSec.appendChild(myBotsBtn);
        body.appendChild(botsSec);

        // Эмодзи-паки
        const emojiSec = document.createElement("div");
        emojiSec.className = "settings-section";
        emojiSec.innerHTML = `<h3>😀 ${t("emojiPacks")}</h3>`;
        const emojiBtn = document.createElement("button");
        emojiBtn.className = "btn btn-primary";
        emojiBtn.textContent = t("open");
        emojiBtn.addEventListener("click", () => {
          this.closeModal();
          setTimeout(() => this.openEmojiPacksManager(), 100);
        });
        emojiSec.appendChild(emojiBtn);
        body.appendChild(emojiSec);

        // Служебные чаты
        const serviceSec = document.createElement("div");
        serviceSec.className = "settings-section";
        serviceSec.innerHTML = `<h3>📂 ${t("serviceChats")}</h3>`;
        const row1 = document.createElement("button");
        row1.className = "btn btn-ghost btn-block";
        row1.textContent = "⭐ " + t("openSaved");
        row1.style.marginBottom = "8px";
        row1.addEventListener("click", () => { this.closeModal(); this.openSavedChat(); });
        serviceSec.appendChild(row1);
        const row2 = document.createElement("button");
        row2.className = "btn btn-ghost btn-block";
        row2.textContent = "📩 " + t("openNotif");
        row2.addEventListener("click", () => { this.closeModal(); this.openNotificationChat(); });
        serviceSec.appendChild(row2);
        body.appendChild(serviceSec);

        // Поиск
        const searchSec = document.createElement("div");
        searchSec.className = "settings-section";
        searchSec.innerHTML = `<h3>🔍 ${t("searchMessages")}</h3>`;
        const inp = document.createElement("input");
        inp.placeholder = "Введи текст…";
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") this.globalMessageSearch(inp.value.trim());
        });
        searchSec.appendChild(inp);
        body.appendChild(searchSec);

        // О приложении
        const about = document.createElement("div");
        about.className = "settings-section";
        about.innerHTML = `<h3>ℹ ${t("aboutApp")}</h3>
          <div style="color:var(--text-0);font-weight:700">NEXORA</div>
          <div style="color:var(--text-2);font-size:13px;margin-top:4px">Connect without limits.</div>
          <div style="color:var(--text-3);font-size:12px;margin-top:6px">Version 8.1</div>`;
        body.appendChild(about);

        const out = document.createElement("button");
        out.className = "btn btn-danger btn-block";
        out.textContent = t("logoutAccount");
        out.addEventListener("click", () => { this.closeModal(); this.logout(); });
        body.appendChild(out);
      },
    });
  }
  section(title, rows) {
    const s = document.createElement("div");
    s.className = "settings-section";
    s.innerHTML = `<h3>${title}</h3>`;
    rows.forEach(r => s.appendChild(r));
    return s;
  }
  row(label, value, onClick, btnLabel = "Изменить") {
    const r = document.createElement("div");
    r.className = "settings-row";
    r.innerHTML = `<div class="settings-row-info">
      <div class="settings-row-label">${escapeHtml(label)}</div>
      <div class="settings-row-desc">${escapeHtml(value)}</div>
    </div>`;
    const b = document.createElement("button");
    b.className = "btn btn-ghost";
    b.textContent = btnLabel;
    b.addEventListener("click", onClick);
    r.appendChild(b);
    return r;
  }
  toggleRow(label, initial, onChange) {
    const r = document.createElement("div");
    r.className = "settings-row";
    r.innerHTML = `<div class="settings-row-info">
      <div class="settings-row-label">${escapeHtml(label)}</div>
    </div>`;
    const sw = document.createElement("div");
    sw.className = "switch" + (initial ? " on" : "");
    sw.addEventListener("click", () => {
      const next = !sw.classList.contains("on");
      sw.classList.toggle("on", next);
      Sounds.click();
      onChange(next);
    });
    r.appendChild(sw);
    return r;
  }

  openProfileThemePicker() {
    const themes = Object.entries(PROFILE_THEMES);
    const current = getProfileTheme();
    this.openModal({
      title: t("profileTheme"),
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">
            Тема применяется ко всему интерфейсу и сохраняется автоматически.
          </p>
          <div class="theme-grid" id="pt-grid"></div>`;
        const grid = body.querySelector("#pt-grid");
        themes.forEach(([id, th]) => {
          const tile = document.createElement("div");
          tile.className = "theme-tile";
          if (id === current) tile.classList.add("active");
          tile.style.background = th.vars["--bg-1"];
          tile.innerHTML = `
            <div class="tt-dot" style="background:${th.vars["--accent"]}"></div>
            <div class="tt-body" style="background:${th.vars["--bg-2"]}; color:${th.vars["--text-0"]}">${escapeHtml(th.name)}</div>
          `;
          tile.addEventListener("click", () => {
            applyProfileTheme(id);
            grid.querySelectorAll(".theme-tile").forEach(x => x.classList.remove("active"));
            tile.classList.add("active");
            toast("Тема: " + th.name, "success");
            Sounds.success();
          });
          grid.appendChild(tile);
        });
      },
    });
  }
  openLanguageDialog() {
    this.openModal({
      title: t("language"),
      narrow: true,
      body: (body) => {
        body.innerHTML = `<div class="language-grid" id="lang-grid"></div>`;
        const grid = body.querySelector("#lang-grid");
        const cur = currentLocale();
        Object.entries(LOCALES).forEach(([code, name]) => {
          const b = document.createElement("button");
          b.textContent = name;
          if (code === cur) b.classList.add("active");
          b.addEventListener("click", () => {
            setLocale(code);
            applyTranslations();
            grid.querySelectorAll("button").forEach(x => x.classList.remove("active"));
            b.classList.add("active");
            toast("Language: " + name, "success");
            Sounds.success();
          });
          grid.appendChild(b);
        });
      },
    });
  }

  async openSessionsDialog() {
    let sessions = [];
    try {
      const { data, error } = await supabase.rpc("list_my_sessions");
      if (!error && data) sessions = data;
    } catch (_) {}
    this.openModal({
      title: t("sessions"),
      body: (body) => {
        body.innerHTML = "";
        if (!sessions.length) {
          body.innerHTML = `<p class="muted">Нет данных о сессиях.</p>`;
        } else {
          sessions.forEach(s => {
            const row = document.createElement("div");
            row.className = "session-row";
            row.innerHTML = `
              <div class="session-info">
                <div class="session-ua">${escapeHtml(s.user_agent || "Unknown device")}</div>
                <div class="session-date">Последняя активность: ${escapeHtml(formatDateTime(s.updated_at))}</div>
              </div>`;
            body.appendChild(row);
          });
        }
        const note = document.createElement("p");
        note.style.cssText = "color:var(--text-3);font-size:12px;margin-top:14px";
        note.textContent = "«Выйти везде» завершит все сеансы, кроме текущего.";
        body.appendChild(note);
        const f = this._openModal.footerEl;
        f.innerHTML = "";
        const close = document.createElement("button");
        close.className = "btn btn-ghost"; close.textContent = t("close");
        close.addEventListener("click", () => this.closeModal());
        const revoke = document.createElement("button");
        revoke.className = "btn btn-danger"; revoke.textContent = "Выйти везде";
        revoke.addEventListener("click", async () => {
          if (!confirm("Завершить все сессии?")) return;
          try {
            const { error } = await supabase.rpc("revoke_all_sessions", { keep_token: null });
            if (error) throw error;
            toast("Все сессии завершены", "success");
            Sounds.success();
            this.closeModal();
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
        f.appendChild(close); f.appendChild(revoke);
      },
    });
  }
  async globalMessageSearch(q) {
    if (!q) return;
    try {
      const { data, error } = await supabase.from("messages")
        .select("id, chat_id, sender_id, content, created_at")
        .textSearch("search_tsv", q, { type: "plain" })
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      this.openModal({
        title: t("searchMessages"),
        wide: true,
        body: (body) => {
          body.innerHTML = `<h4 style="color:var(--text-2);margin-bottom:12px">Найдено: ${data?.length || 0}</h4>`;
          (data || []).forEach(m => {
            const row = document.createElement("div");
            row.className = "settings-row"; row.style.cursor = "pointer";
            row.innerHTML = `<div class="settings-row-info">
              <div class="settings-row-label">${escapeHtml((m.content || "").slice(0, 100))}</div>
              <div class="settings-row-desc">${escapeHtml(formatTime(m.created_at))}</div>
            </div>`;
            row.addEventListener("click", () => { this.closeModal(); this.openChatById(m.chat_id); });
            body.appendChild(row);
          });
        },
      });
    } catch (e) { toast("Ошибка поиска", "error"); }
  }

  /* ============================================================
     PROFILE (self)
     ============================================================ */
  openProfile() {
    this.openModal({
      title: t("profile"),
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <div class="profile-hero">
            ${avatarHTML(this.profile, "xl")}
            <div class="profile-hero-name">${escapeHtml(this.profile.username)}</div>
            <div class="profile-hero-id" id="profile-id">${escapeHtml(this.profile.nexora_id)}</div>
          </div>`;
        body.querySelector("#profile-id").addEventListener("click", () => {
          navigator.clipboard.writeText(this.profile.nexora_id);
          toast("ID скопирован", "success");
          Sounds.click();
        });
        const uploadBtn = document.createElement("button");
        uploadBtn.className = "btn btn-primary btn-block";
        uploadBtn.textContent = "📷 " + t("uploadAvatar");
        uploadBtn.style.marginBottom = "8px";
        uploadBtn.addEventListener("click", () => $("file-avatar").click());
        body.appendChild(uploadBtn);
        const coverBtn = document.createElement("button");
        coverBtn.className = "btn btn-ghost btn-block";
        coverBtn.textContent = "🖼️ " + t("uploadCover");
        coverBtn.style.marginBottom = "14px";
        coverBtn.addEventListener("click", () => $("file-cover").click());
        body.appendChild(coverBtn);
        const unameSec = document.createElement("div");
        unameSec.className = "settings-section";
        unameSec.innerHTML = `<h3>${t("username")}</h3>`;
        const unameInput = document.createElement("input");
        unameInput.value = this.profile.username;
        unameInput.maxLength = 24;
        const unameSave = document.createElement("button");
        unameSave.className = "btn btn-primary";
        unameSave.textContent = t("save");
        unameSave.style.marginTop = "10px";
        unameSave.addEventListener("click", async () => {
          const v = unameInput.value.trim();
          if (!/^[a-zA-Z0-9_]{3,24}$/.test(v)) return toast("3–24 символа, буквы/цифры/_", "warning");
          try {
            await this.updateProfile({ username: v });
            this.renderSidebarFooter();
            toast("Username обновлён", "success");
            Sounds.success();
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
        unameSec.appendChild(unameInput); unameSec.appendChild(unameSave);
        body.appendChild(unameSec);
        const aboutSec = document.createElement("div");
        aboutSec.className = "settings-section";
        aboutSec.innerHTML = `<h3>${t("about")}</h3>`;
        const ta = document.createElement("textarea");
        ta.rows = 3; ta.maxLength = 300;
        ta.value = this.profile.about || "";
        const save = document.createElement("button");
        save.className = "btn btn-primary"; save.textContent = t("save");
        save.style.marginTop = "10px";
        save.addEventListener("click", async () => {
          try {
            await this.updateProfile({ about: ta.value.slice(0, 300) });
            toast("Сохранено", "success");
            Sounds.success();
          } catch (e) { toast("Ошибка", "error"); }
        });
        aboutSec.appendChild(ta); aboutSec.appendChild(save);
        body.appendChild(aboutSec);
      },
    });
  }

  async openUserProfile(userId, peer = null) {
    this.openModal({
      title: t("profile"),
      body: async (body) => {
        body.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
        let card;
        try {
          const { data, error } = await supabase.rpc("get_user_card", { p_user_id: userId });
          if (error) throw error;
          card = Array.isArray(data) ? data[0] : data;
        } catch (e) {
          console.error(e);
          body.innerHTML = `<div class="empty-state">Не удалось загрузить профиль</div>`;
          return;
        }
        if (!card) { body.innerHTML = `<div class="empty-state">Профиль не найден</div>`; return; }
        if (!card.avatar_url && peer?.avatar_url) card.avatar_url = peer.avatar_url;
        if (!card.about && peer?.about) card.about = peer.about;
        const isSelf = card.id === this.user.id;
        const isBot = !!card.is_bot;
        const displayName = card.nickname || card.username;
        const online = !isBot && card.is_online && card.show_online !== false;
        const lastSeen = card.last_seen ? formatTime(card.last_seen) : "";
        const created = card.created_at ? new Date(card.created_at) : null;
        const createdStr = created ? created.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" }) : "";
        body.innerHTML = "";
        const cardEl = document.createElement("div");
        cardEl.className = "profile-card";
        let coverHTML;
        if (card.cover_url) {
          coverHTML = `<div class="profile-cover with-image" style="background-image:url('${safeUrl(card.cover_url)}')"></div>`;
        } else if (card.cover_preset) {
          const clsMap = {
            "gradient-1": "cover-gradient-1", "gradient-2": "cover-gradient-2",
            "gradient-3": "cover-gradient-3", "gradient-4": "cover-gradient-4",
            "gradient-5": "cover-gradient-5", "particles": "cover-gradient-1 particles",
            "waves": "waves",
          };
          const cls = clsMap[card.cover_preset] || "cover-gradient-1";
          coverHTML = `<div class="profile-cover preset ${cls}"></div>`;
        } else {
          coverHTML = `<div class="profile-cover"></div>`;
        }
        cardEl.innerHTML = `
          ${coverHTML}
          <div class="profile-avatar-wrap">
            ${avatarHTML(card, "xl").replace('class="avatar avatar-xl', 'class="avatar avatar-xl profile-avatar-clickable')}
          </div>
          <div class="profile-name">${escapeHtml(displayName)}${isBot ? ' <span class="bot-badge">[BOT]</span>' : ""}</div>
          ${card.nickname ? `<div class="profile-nickname">настоящий ник: @${escapeHtml(card.username)}</div>` : ""}
          <div class="profile-id-badge" id="card-id-copy">${escapeHtml(card.nexora_id)}</div>
          <div class="profile-status">
            <span><span class="dot ${online ? "online" : ""}"></span>
              ${online ? t("online") : (lastSeen ? t("wasOnline") + " " + lastSeen : t("offline"))}
            </span>
          </div>
          ${card.activity_text ? `<div class="activity-line">${escapeHtml(card.activity_text)}</div>` : ""}
          ${card.about ? `
            <div class="settings-section" style="margin-top:16px;background:var(--bg-2)">
              <h3 style="margin-bottom:8px">${t("about")}</h3>
              <div style="color:var(--text-1);font-size:13px;line-height:1.5">${escapeHtml(card.about)}</div>
            </div>
          ` : ""}`;
        body.appendChild(cardEl);
        cardEl.querySelector("#card-id-copy").addEventListener("click", () => {
          navigator.clipboard.writeText(card.nexora_id);
          toast("ID скопирован", "success");
          Sounds.click();
        });
        const av = cardEl.querySelector(".profile-avatar-clickable");
        if (av && card.avatar_url) av.addEventListener("click", () => this.openLightbox(card.avatar_url, "image"));
        const statsEl = document.createElement("div");
        statsEl.className = "profile-stats";
        statsEl.innerHTML = `
          <div class="profile-stat"><div class="profile-stat-value" id="stat-chats">…</div><div class="profile-stat-label">Чатов</div></div>
          <div class="profile-stat"><div class="profile-stat-value" id="stat-msgs">…</div><div class="profile-stat-label">Сообщений</div></div>`;
        cardEl.appendChild(statsEl);
        (async () => {
          try {
            const { data } = await supabase.rpc("get_profile_details", { p_user_id: card.id });
            const row = Array.isArray(data) ? data[0] : data;
            if (row) {
              cardEl.querySelector("#stat-chats").textContent = row.chat_count ?? 0;
              cardEl.querySelector("#stat-msgs").textContent = row.message_count ?? 0;
            }
          } catch (_) {
            cardEl.querySelector("#stat-chats").textContent = "—";
            cardEl.querySelector("#stat-msgs").textContent = "—";
          }
        })();
        if (createdStr) {
          const reg = document.createElement("div");
          reg.style.cssText = "text-align:center;font-size:11px;color:var(--text-3);margin-top:12px";
          reg.textContent = "В NEXORA с " + createdStr;
          cardEl.appendChild(reg);
        }
        const actions = document.createElement("div");
        actions.className = "profile-actions";
        if (isSelf) {
          const edit = document.createElement("button");
          edit.className = "btn btn-primary btn-full";
          edit.textContent = "✎ " + t("editProfile");
          edit.addEventListener("click", () => { this.closeModal(); this.openProfile(); });
          actions.appendChild(edit);
          const share = document.createElement("button");
          share.className = "btn btn-ghost";
          share.textContent = "🔗 " + t("shareId");
          share.addEventListener("click", () => {
            const link = `${location.origin}${location.pathname}?u=${card.nexora_id}`;
            navigator.clipboard.writeText(link).then(() => {
              toast("Ссылка скопирована", "success");
              Sounds.success();
            });
          });
          actions.appendChild(share);
          const avBtn = document.createElement("button");
          avBtn.className = "btn btn-ghost";
          avBtn.textContent = "📷 " + t("changeAvatar");
          avBtn.addEventListener("click", () => $("file-avatar").click());
          actions.appendChild(avBtn);
        } else {
          const msg = document.createElement("button");
          msg.className = "btn btn-primary btn-full";
          msg.textContent = "💬 " + t("writeMessage2");
          msg.addEventListener("click", () => { this.closeModal(); this.openDirectChat(card); });
          actions.appendChild(msg);
          const renameBtn = document.createElement("button");
          renameBtn.className = "btn btn-ghost";
          renameBtn.textContent = card.is_contact
            ? (card.nickname ? "✎ " + t("renameShort") : "✎ " + t("rename"))
            : "+ " + t("addToContacts");
          renameBtn.addEventListener("click", () => {
            if (card.is_contact) {
              this.closeModal();
              this.openRenameContactDialog(card);
            } else {
              this.addContact(card.id).then(async () => {
                await this.refreshContacts();
                toast("Добавлен в контакты", "success");
                Sounds.success();
                this.closeModal();
                this.openUserProfile(card.id, card);
              }).catch(e => toast(e.message || "Ошибка", "error"));
            }
          });
          actions.appendChild(renameBtn);
          if (card.is_contact) {
            const rm = document.createElement("button");
            rm.className = "btn btn-ghost";
            rm.textContent = "🗑 " + t("removeFromContacts");
            rm.addEventListener("click", async () => {
              if (!confirm(`Удалить @${card.username}?`)) return;
              try {
                await supabase.rpc("remove_contact", { p_contact_id: card.id });
                await this.refreshContacts();
                toast("Удалён", "warning");
                Sounds.click();
                this.closeModal();
                this.openUserProfile(card.id, card);
              } catch (e) { toast(e.message || "Ошибка", "error"); }
            });
            actions.appendChild(rm);
          }
          const block = document.createElement("button");
          if (card.is_blocked) {
            block.className = "btn btn-ghost btn-full";
            block.textContent = "✓ " + t("unblock");
            block.addEventListener("click", async () => {
              if (!confirm("Разблокировать?")) return;
              try {
                await supabase.rpc("unblock_user", { p_user_id: card.id });
                toast("Разблокирован", "success");
                Sounds.success();
                this.closeModal();
                this.openUserProfile(card.id, card);
              } catch (e) { toast(e.message || "Ошибка", "error"); }
            });
          } else {
            block.className = "btn btn-danger";
            block.textContent = "🚫 " + t("block");
            block.addEventListener("click", async () => {
              if (!confirm("Заблокировать?")) return;
              try {
                await this.blockUser(card.id);
                toast("Заблокирован", "warning");
                Sounds.error();
                this.closeModal();
                this.openUserProfile(card.id, card);
              } catch (e) { toast(e.message || "Ошибка", "error"); }
            });
          }
          actions.appendChild(block);
          const report = document.createElement("button");
          report.className = "btn btn-ghost btn-full";
          report.textContent = "⚠ " + t("report");
          report.addEventListener("click", () => { this.closeModal(); this.openReportDialog(card); });
          actions.appendChild(report);
          if (isBot) {
            actions.innerHTML = "";
            const msgBot = document.createElement("button");
            msgBot.className = "btn btn-primary btn-full";
            msgBot.textContent = "💬 Открыть чат с ботом";
            msgBot.addEventListener("click", () => { this.closeModal(); this.openDirectChat(card); });
            actions.appendChild(msgBot);
          }
        }
        cardEl.appendChild(actions);
      },
    });
  }
  openRenameContactDialog(card) {
    this.openModal({
      title: "Ярлык контакта",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">
            Как показывать <b>@${escapeHtml(card.username)}</b>.
          </p>
          <input id="rn-input" maxlength="40" value="${escapeHtml(card.nickname || card.username)}">
          <div id="rn-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="rn-cancel">${t("cancel")}</button>
            <button class="btn btn-primary" id="rn-save">${t("save")}</button>
          </div>`;
        const inp = body.querySelector("#rn-input");
        setTimeout(() => { inp.focus(); inp.select(); }, 100);
        body.querySelector("#rn-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#rn-save").addEventListener("click", async () => {
          const v = inp.value.trim();
          if (!v) return toast("Введи имя", "warning");
          try {
            const { error } = await supabase.rpc("set_contact_nickname", {
              p_contact_id: card.id, p_nickname: v,
            });
            if (error) throw error;
            toast("Сохранено", "success");
            Sounds.success();
            this.closeModal();
            await this.refreshChats();
            await this.refreshContacts();
          } catch (e) {
            const err = body.querySelector("#rn-error");
            err.textContent = e.message || "Ошибка";
            err.classList.add("show");
          }
        });
      },
    });
  }
  openReportDialog(card) {
    const reasons = ["Спам", "Оскорбления", "Мошенничество", "Порнография", "Другое"];
    this.openModal({
      title: `Жалоба на @${card.username}`,
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">Выбери причину:</p>
          <div id="rp-reasons" style="display:flex;flex-direction:column;gap:6px"></div>
          <div class="form-group" style="margin-top:14px">
            <label>Комментарий</label>
            <textarea id="rp-comment" rows="3" maxlength="500"></textarea>
          </div>
          <div id="rp-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="rp-cancel">${t("cancel")}</button>
            <button class="btn btn-primary" id="rp-send">Отправить</button>
          </div>`;
        let picked = reasons[0];
        const holder = body.querySelector("#rp-reasons");
        reasons.forEach(r => {
          const b = document.createElement("button");
          b.className = "btn " + (r === picked ? "btn-primary" : "btn-ghost");
          b.textContent = r; b.style.justifyContent = "flex-start";
          b.addEventListener("click", () => {
            picked = r;
            holder.querySelectorAll("button").forEach(x => x.className = "btn btn-ghost");
            b.className = "btn btn-primary";
          });
          holder.appendChild(b);
        });
        body.querySelector("#rp-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#rp-send").addEventListener("click", async () => {
          const comment = body.querySelector("#rp-comment").value.trim();
          try {
            const { error } = await supabase.from("reports").insert({
              reporter_id: this.user.id, reported_id: card.id, reason: picked, comment,
            });
            if (error) throw error;
            toast("Жалоба отправлена", "success");
            Sounds.success();
            this.closeModal();
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
      },
    });
  }

  /* ============================================================
     CHAT INFO
     ============================================================ */
  openChatInfo() {
    if (!this.activeChat) return;
    const ctype = this.activeChat.type || "direct";
    if (this.activeChat.is_notification) return this.openChatThemePicker(this.activeChat);
    if (ctype === "direct" && this.activeChat.peer) return this.openUserProfile(this.activeChat.peer.id, this.activeChat.peer);
    if (ctype === "saved") return this.openChatThemePicker(this.activeChat);
    if (ctype === "channel") {
      if (this.activeChat.my_role === "owner" || this.activeChat.my_role === "admin") return this.openChannelSettings(this.activeChat);
      return this.openChannelInfoReadonly(this.activeChat);
    }
    if (ctype === "group") {
      if (this.activeChat.my_role === "owner" || this.activeChat.my_role === "admin") return this.openGroupSettings(this.activeChat);
      return this.openGroupInfoReadonly(this.activeChat);
    }
  }
  openChannelInfoReadonly(chat) {
    this.openModal({
      title: "О канале",
      body: (body) => {
        body.innerHTML = `
          <div class="profile-hero">
            <div class="avatar avatar-lg">📢</div>
            <div class="profile-hero-name">${escapeHtml(chat.title || "")}</div>
            <div class="profile-id-badge">${chat.username ? "@" + escapeHtml(chat.username) : "приватный"}</div>
          </div>
          <div class="settings-section">
            <h3>Информация</h3>
            <div style="color:var(--text-2);font-size:13px">Подписчиков: ${chat.members_count || 0}</div>
            ${chat.description ? `<div style="color:var(--text-2);font-size:13px;margin-top:8px">${escapeHtml(chat.description)}</div>` : ""}
          </div>`;
        const shareBtn = document.createElement("button");
        shareBtn.className = "btn btn-ghost btn-block";
        shareBtn.textContent = "🔗 " + t("copyLink");
        shareBtn.addEventListener("click", () => { this.closeModal(); setTimeout(() => this.openChannelShare(chat), 100); });
        body.appendChild(shareBtn);
        const leave = document.createElement("button");
        leave.className = "btn btn-danger btn-block";
        leave.style.marginTop = "10px";
        leave.textContent = "Отписаться";
        leave.addEventListener("click", async () => {
          if (!confirm("Отписаться?")) return;
          await supabase.from("chat_members").delete().eq("chat_id", chat.id).eq("user_id", this.user.id);
          this.closeModal();
          $("chat-view").classList.add("hidden");
          $("welcome").classList.remove("hidden");
          this.activeChat = null;
          await this.refreshChats();
          toast("Отписались", "warning");
        });
        body.appendChild(leave);
      },
    });
  }
  openGroupInfoReadonly(chat) {
    this.openModal({
      title: "О группе",
      body: (body) => {
        body.innerHTML = `
          <div class="profile-hero">
            <div class="avatar avatar-lg">👥</div>
            <div class="profile-hero-name">${escapeHtml(chat.title || "")}</div>
            <div class="profile-id-badge">${chat.username ? "@" + escapeHtml(chat.username) : "приватная"}</div>
          </div>
          <div class="settings-section">
            <h3>Информация</h3>
            <div style="color:var(--text-2);font-size:13px">Участников: ${chat.members_count || 0}</div>
          </div>`;
        const shareBtn = document.createElement("button");
        shareBtn.className = "btn btn-ghost btn-block";
        shareBtn.textContent = "🔗 " + t("copyLink");
        shareBtn.addEventListener("click", () => { this.closeModal(); setTimeout(() => this.openChannelShare(chat), 100); });
        body.appendChild(shareBtn);
        const leave = document.createElement("button");
        leave.className = "btn btn-danger btn-block";
        leave.style.marginTop = "10px";
        leave.textContent = "Покинуть группу";
        leave.addEventListener("click", async () => {
          if (!confirm("Покинуть?")) return;
          await supabase.from("chat_members").delete().eq("chat_id", chat.id).eq("user_id", this.user.id);
          this.closeModal();
          $("chat-view").classList.add("hidden");
          $("welcome").classList.remove("hidden");
          this.activeChat = null;
          await this.refreshChats();
          toast("Покинули", "warning");
        });
        body.appendChild(leave);
      },
    });
  }

  /* ============================================================
     ACCOUNT ACTIONS
     ============================================================ */
  async changeUsername() {
    const v = prompt("Новый username (3–24):", this.profile.username);
    if (!v) return;
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(v)) return toast("3–24 символа", "warning");
    try {
      await this.updateProfile({ username: v });
      this.renderSidebarFooter();
      toast("Username обновлён", "success");
      Sounds.success();
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }
  async changePassword() {
    const p = prompt("Новый пароль (мин. 8):");
    if (!p) return;
    if (p.length < 8) return toast("Минимум 8 символов", "warning");
    try {
      const { error } = await supabase.auth.updateUser({ password: p });
      if (error) throw error;
      toast("Пароль изменён", "success");
      Sounds.success();
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }
  async toggle2FA() {
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = (factors?.totp || []).find(f => f.status === "verified");
      if (totp) {
        if (!confirm("Отключить 2FA?")) return;
        await supabase.auth.mfa.unenroll({ factorId: totp.id });
        toast("2FA отключена", "warning");
        return;
      }
      const { data: enroll, error } = await supabase.auth.mfa.enroll({
        factorType: "totp", friendlyName: "NEXORA TOTP",
      });
      if (error) throw error;
      this.closeModal();
      setTimeout(() => this.openTotpModal(enroll), 100);
    } catch (e) { toast(e.message || "Ошибка 2FA", "error"); }
  }
  openTotpModal(enroll) {
    this.openModal({
      title: "Включение 2FA",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">
            Отсканируй QR в Google Authenticator.
          </p>
          <div id="qr-holder" style="background:#fff;padding:12px;border-radius:10px;text-align:center"></div>
          <p style="font-size:12px;color:var(--text-3);margin:12px 0 6px">Секрет:</p>
          <code style="background:var(--bg-2);padding:8px 12px;border-radius:6px;font-size:12px;display:block;word-break:break-all">${escapeHtml(enroll.totp.secret)}</code>
          <input id="totp-code" class="mfa-input" maxlength="6" inputmode="numeric" placeholder="000000" style="margin-top:14px">
          <div id="totp-error" class="form-error" style="margin-top:10px"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="totp-cancel">${t("cancel")}</button>
            <button class="btn btn-primary" id="totp-verify">${t("verify")}</button>
          </div>`;
        const holder = body.querySelector("#qr-holder");
        const qr = enroll.totp.qr_code;
        if (typeof qr === "string" && qr.startsWith("data:")) {
          const img = document.createElement("img"); img.src = qr; img.style.maxWidth = "200px"; holder.appendChild(img);
        } else if (typeof qr === "string" && qr.startsWith("<svg")) {
          holder.innerHTML = qr;
        } else {
          holder.textContent = "QR недоступен, используй секрет";
        }
        body.querySelector("#totp-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#totp-verify").addEventListener("click", async () => {
          const code = body.querySelector("#totp-code").value.trim();
          const errEl = body.querySelector("#totp-error");
          errEl.classList.remove("show");
          if (!/^\d{6}$/.test(code)) { errEl.textContent = "Введи 6 цифр"; errEl.classList.add("show"); return; }
          try {
            const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
            if (cErr) throw cErr;
            const { error } = await supabase.auth.mfa.verify({
              factorId: enroll.id, challengeId: ch.id, code,
            });
            if (error) throw error;
            toast("2FA включена", "success");
            Sounds.success();
            this.closeModal();
          } catch (e) { errEl.textContent = e.message || "Неверный код"; errEl.classList.add("show"); }
        });
      },
    });
  }

  /* ============================================================
     NEW CHAT / GROUP / CHANNEL
     ============================================================ */
  openNewChatDialog(presetType = "group") {
    this.openModal({
      title: "Новый чат",
      body: (body) => {
        let chatType = presetType;
        body.innerHTML = `
          <div class="settings-section">
            <h3>${t("type")}</h3>
            <div id="nc-type" style="display:flex;gap:8px"></div>
          </div>
          <div class="settings-section">
            <h3>${t("name")}</h3>
            <input id="nc-title" maxlength="80" placeholder="${t("name")}">
            <input id="nc-desc" maxlength="200" placeholder="${t("description")}" style="margin-top:10px">
          </div>
          <div class="settings-section" id="nc-privacy-block">
            <h3>Публичность</h3>
            <div id="nc-public" style="display:flex;gap:8px"></div>
            <div id="nc-username-wrap" style="margin-top:10px;display:none">
              <label style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:1px">${t("username")}</label>
              <div class="input-prefix" style="margin-top:6px">
                <span class="prefix">@</span>
                <input id="nc-username" maxlength="32" placeholder="my_channel">
              </div>
              <small style="display:block;margin-top:6px;color:var(--text-3);font-size:11px">5–32 символа, латиница, цифры, _.</small>
            </div>
          </div>
          <div class="settings-section">
            <h3>${t("participants")}</h3>
            <div id="nc-members"></div>
          </div>
          <div id="nc-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="nc-cancel">${t("cancel")}</button>
            <button class="btn btn-primary" id="nc-create">${t("create")}</button>
          </div>`;
        const typeBox = body.querySelector("#nc-type");
        const privacyBlock = body.querySelector("#nc-privacy-block");
        let pickedPublic = true;
        const setType = (tt) => {
          chatType = tt;
          typeBox.querySelectorAll("button").forEach(x => x.className = "btn btn-ghost");
          typeBox.children[tt === "group" ? 0 : 1].className = "btn btn-primary";
          privacyBlock.style.display = "block";
        };
        ["👥 " + t("group"), "📢 " + t("channel")].forEach((label, i) => {
          const b = document.createElement("button");
          b.className = "btn " + ((i === 0 && chatType === "group") || (i === 1 && chatType === "channel") ? "btn-primary" : "btn-ghost");
          b.textContent = label;
          b.addEventListener("click", () => setType(i === 0 ? "group" : "channel"));
          typeBox.appendChild(b);
        });
        const pubBox = body.querySelector("#nc-public");
        const unameWrap = body.querySelector("#nc-username-wrap");
        const setPublic = (pub) => {
          pickedPublic = pub;
          pubBox.querySelectorAll("button").forEach(x => x.className = "btn btn-ghost");
          pubBox.children[pub ? 0 : 1].className = "btn btn-primary";
          unameWrap.style.display = pub ? "block" : "none";
        };
        [t("public"), t("private")].forEach((label, i) => {
          const b = document.createElement("button");
          b.className = "btn " + (i === 0 ? "btn-primary" : "btn-ghost");
          b.textContent = label;
          b.addEventListener("click", () => setPublic(i === 0));
          pubBox.appendChild(b);
        });
        setType(chatType);
        setPublic(true);
        const membersBox = body.querySelector("#nc-members");
        const checks = [];
        if (!this.contacts.length) {
          membersBox.innerHTML = `<p class="muted">Нет контактов</p>`;
        } else {
          this.contacts.forEach(c => {
            const row = document.createElement("label");
            row.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer";
            const cb = document.createElement("input");
            cb.type = "checkbox"; cb.value = c.id; cb.style.width = "auto";
            checks.push(cb);
            row.appendChild(cb);
            const span = document.createElement("span");
            span.innerHTML = `${escapeHtml(c.nickname || c.username)} <span style="color:var(--text-3);font-size:11px">${escapeHtml(c.nexora_id)}</span>`;
            row.appendChild(span);
            membersBox.appendChild(row);
          });
        }
        body.querySelector("#nc-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#nc-create").addEventListener("click", async () => {
          const errEl = body.querySelector("#nc-error");
          errEl.classList.remove("show");
          const title = body.querySelector("#nc-title").value.trim();
          if (!title) { errEl.textContent = "Введи название"; errEl.classList.add("show"); return; }
          const ids = checks.filter(c => c.checked).map(c => c.value);
          const desc = body.querySelector("#nc-desc").value.trim() || null;
          try {
            let chatId;
            if (chatType === "channel") {
              const uname = pickedPublic ? body.querySelector("#nc-username").value.trim().toLowerCase() : null;
              if (pickedPublic && !/^[a-z][a-z0-9_]{4,31}$/.test(uname || "")) {
                errEl.textContent = "Username: 5–32, начинается с буквы"; errEl.classList.add("show"); return;
              }
              const { data, error } = await supabase.rpc("create_channel", {
                p_title: title, p_description: desc, p_member_ids: ids,
                p_is_public: pickedPublic, p_username: uname,
              });
              if (error) throw error;
              chatId = data;
            } else {
              const { data, error } = await supabase.rpc("create_group_chat", {
                p_title: title, p_member_ids: ids, p_type: "group", p_description: desc,
              });
              if (error) throw error;
              chatId = data;
              const uname = pickedPublic ? body.querySelector("#nc-username").value.trim().toLowerCase() : null;
              if (pickedPublic && /^[a-z][a-z0-9_]{4,31}$/.test(uname || "")) {
                try {
                  await supabase.rpc("update_group_settings", {
                    p_chat_id: chatId, p_title: title, p_description: desc,
                    p_is_public: pickedPublic, p_username: uname,
                  });
                } catch (_) {}
              }
            }
            toast(chatType === "channel" ? "Канал создан" : "Группа создана", "success");
            Sounds.success();
            this.closeModal();
            await this.refreshChats();
            await this.openChatById(chatId);
          } catch (e) { errEl.textContent = e.message || "Ошибка"; errEl.classList.add("show"); }
        });
      },
    });
  }
  openInviteDialog() {
    const existing = new Set(this.members.map(m => m.user_id));
    const candidates = this.contacts.filter(c => !existing.has(c.id));
    this.openModal({
      title: "Пригласить",
      narrow: true,
      body: (body) => {
        if (!candidates.length) {
          body.innerHTML = `<p class="muted">Все контакты уже в чате</p>`;
          return;
        }
        candidates.forEach(c => {
          const row = document.createElement("div");
          row.className = "settings-row";
          row.innerHTML = `<div class="settings-row-info">
            <div class="settings-row-label">${escapeHtml(c.nickname || c.username)}</div>
            <div class="settings-row-desc">${escapeHtml(c.nexora_id)}</div>
          </div>`;
          const b = document.createElement("button");
          b.className = "btn btn-primary"; b.textContent = "→";
          b.addEventListener("click", async () => {
            try {
              const { error } = await supabase.rpc("add_chat_member", {
                p_chat_id: this.activeChat.id, p_user_id: c.id,
              });
              if (error) throw error;
              b.textContent = "✓"; b.disabled = true;
              toast("Добавлен", "success");
              Sounds.success();
            } catch (e) { toast(e.message || "Ошибка", "error"); }
          });
          row.appendChild(b);
          body.appendChild(row);
        });
      },
    });
  }

  /* ============================================================
     SEARCH
     ============================================================ */
  async searchUser(query) {
    const q = (query || "").trim();
    if (!q) return;
    if (q.startsWith("@")) return this.searchChannel(q.slice(1));
    const list = $("sidebar-list");
    list.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
    try {
      const { data, error } = await supabase.rpc("search_user", { query: q });
      if (error) throw error;
      list.innerHTML = "";
      if (!data || !data.length) {
        const ch = await this.tryFindChannel(q);
        if (ch) return this.renderChannelResult(ch, list);
        list.innerHTML = `<div class="empty-state">Никого не нашёл: ${escapeHtml(q)}<br><small>ID, ник или @канал</small></div>`;
        return;
      }
      data.forEach(u => {
        if (u.id === this.user.id) return;
        const card = document.createElement("div");
        card.className = "user-card";
        const botTag = u.is_bot ? ' <span class="bot-badge">[BOT]</span>' : "";
        card.innerHTML = `
          ${avatarHTML(u, "md")}
          <div class="user-card-body">
            <div class="user-card-name">${escapeHtml(u.username)}${botTag}</div>
            <div class="user-card-id">${escapeHtml(u.nexora_id)}</div>
          </div>
          <button class="btn btn-primary">${t("open")}</button>`;
        card.querySelector("button").addEventListener("click", () => this.openUserProfile(u.id, u));
        list.appendChild(card);
      });
      if (!list.children.length) {
        list.innerHTML = `<div class="empty-state">Это только ты 🙂</div>`;
      }
    } catch (e) {
      console.error(e);
      list.innerHTML = `<div class="empty-state">Ошибка поиска: ${escapeHtml(e.message || "")}</div>`;
    }
  }
  async tryFindChannel(q) {
    try {
      const { data, error } = await supabase.rpc("find_channel", { query: q });
      if (error) return null;
      return Array.isArray(data) ? data[0] : data;
    } catch (_) { return null; }
  }
  async searchChannel(name) {
    const list = $("sidebar-list");
    list.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
    const ch = await this.tryFindChannel(name);
    list.innerHTML = "";
    if (!ch) {
      list.innerHTML = `<div class="empty-state">Канал не найден: @${escapeHtml(name)}</div>`;
      return;
    }
    this.renderChannelResult(ch, list);
  }
  renderChannelResult(ch, container) {
    const card = document.createElement("div");
    card.className = "user-card";
    const pubTag = ch.is_public ? "public" : "private";
    const unameLine = ch.username ? `@${escapeHtml(ch.username)}` : "(приватный)";
    const kind = ch.type === "group" ? "👥" : "📢";
    card.innerHTML = `
      <div class="avatar avatar-md">${kind}</div>
      <div class="user-card-body">
        <div class="user-card-name">${escapeHtml(ch.title)}
          <span class="channel-badge ${pubTag}">${pubTag}</span>
        </div>
        <div class="user-card-id">${unameLine} · ${ch.members_count} участников</div>
      </div>
      <button class="btn btn-primary">${ch.already_member ? t("open") : "Войти"}</button>`;
    card.querySelector("button").addEventListener("click", async () => {
      if (ch.already_member) {
        await this.refreshChats();
        await this.openChatById(ch.id);
      } else if (ch.is_public) {
        try {
          const { error } = await supabase.rpc("join_channel", { p_chat_id: ch.id });
          if (error) throw error;
          toast("Присоединились", "success");
          Sounds.success();
          await this.refreshChats();
          await this.openChatById(ch.id);
        } catch (e) { toast(e.message || "Ошибка", "error"); }
      } else {
        try {
          const { error } = await supabase.from("chat_members").insert({
            chat_id: ch.id, user_id: this.user.id, role: "member",
          });
          if (error) throw error;
          toast("Присоединились", "success");
          Sounds.success();
          await this.refreshChats();
          await this.openChatById(ch.id);
        } catch (e) { toast(e.message || "Ошибка", "error"); }
      }
    });
    container.appendChild(card);
  }

  /* ============================================================
     UPLOADS
     ============================================================ */
  async uploadAvatar(file) {
    if (!file.type.startsWith("image/")) throw new Error("Только изображения");
    if (file.size > AVATAR_MAX) throw new Error("Максимум 2 MB");
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${this.user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const url = pub.publicUrl + "?t=" + Date.now();
    await this.updateProfile({ avatar_url: url });
    return url;
  }
  async uploadCover(file) {
    if (!file.type.startsWith("image/")) throw new Error("Только изображения");
    if (file.size > COVER_MAX) throw new Error("Максимум 4 MB");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${this.user.id}/cover.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const url = pub.publicUrl + "?t=" + Date.now();
    await this.updateProfile({ cover_url: url, cover_preset: null });
    return url;
  }

  /* ============================================================
     GLOBAL BINDINGS
     ============================================================ */
  bindGlobalEvents() {
    window.addEventListener("DOMContentLoaded", () => {
      applyProfileTheme(getProfileTheme());
      applyTranslations();

      // AUTH
      $("btn-login").addEventListener("click", () => this.doLogin());
      $("btn-register").addEventListener("click", () => this.doRegister());
      $("btn-mfa").addEventListener("click", () => this.doMfaVerify());
      $("goto-register").addEventListener("click", () => { Sounds.click(); this.showAuthCard("register"); });
      $("goto-login").addEventListener("click", () => { Sounds.click(); this.showAuthCard("login"); });
      $("mfa-cancel").addEventListener("click", () => { Sounds.click(); this.showAuthCard("login"); });
      $("goto-forgot").addEventListener("click", () => {
        alert("Восстановление через email недоступно — аккаунт использует nickname.");
      });
      ["login-username", "login-password"].forEach(id => {
        $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") this.doLogin(); });
      });
      $("reg-password2").addEventListener("keydown", (e) => { if (e.key === "Enter") this.doRegister(); });
      $("mfa-code").addEventListener("keydown", (e) => { if (e.key === "Enter") this.doMfaVerify(); });

      // TABS
      $$(".tab").forEach(t2 => t2.addEventListener("click", () => this.setTab(t2.dataset.tab)));

      // SETTINGS / LOGOUT
      $("btn-settings").addEventListener("click", () => { Sounds.click(); this.openSettings(); });
      $("btn-logout").addEventListener("click", () => this.logout());
      const sTop = $("btn-settings-top");
      if (sTop) sTop.addEventListener("click", () => { Sounds.click(); this.openSettings(); });
      const lTop = $("btn-logout-top");
      if (lTop) lTop.addEventListener("click", () => this.logout());

      // ACCOUNTS
      const accBtn = $("btn-accounts");
      if (accBtn) accBtn.addEventListener("click", () => { Sounds.click(); this.openAccountsSwitcher(); });

      // NOTIFICATIONS CHAT
      const notifBtn = $("btn-notifications");
      if (notifBtn) notifBtn.addEventListener("click", () => { Sounds.click(); this.openNotificationChat(); });

      // CATALOG
      const catBtn = $("btn-catalog");
      if (catBtn) catBtn.addEventListener("click", () => { Sounds.click(); this.openChannelCatalog(); });

      // SEARCH CHANNEL
      const searchChan = $("btn-search-channel");
      if (searchChan) searchChan.addEventListener("click", () => {
        Sounds.click();
        const q = prompt("Введите @username или ссылку:");
        if (q) this.searchChannel(q.replace(/^@/, ""));
      });

      // PROFILE
      $("me-avatar").addEventListener("click", () => { Sounds.click(); this.openProfile(); });
      $("me-name").addEventListener("click", () => { Sounds.click(); this.openProfile(); });

      // SEARCH INPUT
      $("search-input").addEventListener("input", (e) => {
        clearTimeout(this.searchTimeout);
        const q = e.target.value.trim();
        if (!q) { this.renderSidebarList(); return; }
        this.searchTimeout = setTimeout(() => this.searchUser(q), 300);
      });

      // NEW CHAT
      $("btn-new-chat").addEventListener("click", () => { Sounds.click(); this.openNewChatDialog(); });

      // QUICK ACTIONS
      const qGroup = $("btn-quick-group");
      if (qGroup) qGroup.addEventListener("click", () => { Sounds.click(); this.openNewChatDialog("group"); });
      const qChannel = $("btn-quick-channel");
      if (qChannel) qChannel.addEventListener("click", () => { Sounds.click(); this.openNewChatDialog("channel"); });
      const qBot = $("btn-quick-bot");
      if (qBot) qBot.addEventListener("click", () => { Sounds.click(); this.openBotFather(); });
      const qLocal = $("btn-quick-local");
      if (qLocal) qLocal.addEventListener("click", () => { Sounds.click(); this.openLocalRoomsDialog(); });
      const qEph = $("btn-quick-ephemeral");
      if (qEph) qEph.addEventListener("click", () => { Sounds.click(); this.openEphemeralDialog(); });

      // COMPOSER
      const composer = $("composer");
      composer.addEventListener("input", () => {
        composer.style.height = "auto";
        composer.style.height = Math.min(composer.scrollHeight, 160) + "px";
        this.broadcastTyping();
      });
      composer.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendCurrent(); }
      });
      $("btn-send").addEventListener("click", () => this.sendCurrent());
      $("btn-attach").addEventListener("click", () => { Sounds.click(); this.pickAttachment(); });
      $("btn-emoji").addEventListener("click", () => { Sounds.click(); this.openPicker(); });
      const pollBtn = $("btn-poll");
      if (pollBtn) pollBtn.addEventListener("click", () => { Sounds.click(); this.openPollCreator(); });
      const voiceBtn = $("btn-voice");
      if (voiceBtn) voiceBtn.addEventListener("click", () => { Sounds.click(); this.toggleVoiceRecording(); });
      $("attach-cancel").addEventListener("click", () => this.hideAttachBar());

      const vCancel = $("voice-cancel-btn");
      if (vCancel) vCancel.addEventListener("click", () => {
        if (this._recorder) {
          this._recorder.onstop = null;
          try { this._recorder.stop(); } catch (_) {}
          this._recorder = null;
        }
        if (this._voiceTimer) { clearInterval(this._voiceTimer); this._voiceTimer = null; }
        $("voice-bar").classList.add("hidden");
      });
      const vSend = $("voice-send-btn");
      if (vSend) vSend.addEventListener("click", () => this.stopVoiceRecording());

      $("btn-chat-info").addEventListener("click", () => { Sounds.click(); this.openChatInfo(); });
      $("chat-header-body").addEventListener("click", () => { Sounds.click(); this.openChatInfo(); });

      const peerAv = $("chat-peer-avatar");
      if (peerAv) peerAv.addEventListener("click", () => {
        if (!this.activeChat) return;
        const ctype = this.activeChat.type || "direct";
        if (ctype === "direct" && this.activeChat.peer) {
          Sounds.click();
          this.openUserProfile(this.activeChat.peer.id, this.activeChat.peer);
        } else {
          this.openChatInfo();
        }
      });

      // MOBILE
      $("btn-mobile-menu").addEventListener("click", () => {
        $("sidebar").classList.toggle("hidden-mobile");
      });
      $("sidebar").addEventListener("click", (e) => {
        if (window.innerWidth <= 768 && e.target.closest(".list-item")) {
          $("sidebar").classList.add("hidden-mobile");
        }
      });

      // FILE INPUTS
      $("file-avatar").addEventListener("change", async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          toast("Загрузка…", "info");
          await this.uploadAvatar(f);
          this.renderSidebarFooter();
          this.rememberAccount({
            id: this.user.id, username: this.profile.username,
            nexora_id: this.profile.nexora_id, avatar_url: this.profile.avatar_url,
          });
          toast("Аватар обновлён", "success");
          Sounds.success();
        } catch (err) { toast(err.message || "Ошибка", "error"); }
      });
      const fileCover = $("file-cover");
      if (fileCover) fileCover.addEventListener("change", async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          toast("Загрузка…", "info");
          await this.uploadCover(f);
          toast("Обложка обновлена", "success");
          Sounds.success();
        } catch (err) { toast(err.message || "Ошибка", "error"); }
      });

      // GLOBAL CLICK
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".ctx-menu")) this.closeContextMenu();
        Sounds.unlock();
      });

      // PARALLAX
      window.addEventListener("mousemove", (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 20;
        const y = (e.clientY / window.innerHeight - 0.5) * 20;
        document.body.style.setProperty("--parallax-x", `${x}px`);
        document.body.style.setProperty("--parallax-y", `${y}px`);
      });

      if (window.innerWidth <= 768) {
        $("sidebar").classList.remove("hidden-mobile");
      }

      // BOOT
      this.boot().catch(err => {
        console.error(err);
        toast("Ошибка запуска", "error");
        this.showScreen("screen-auth");
        this.showAuthCard("login");
      });
    });
  }
}

/* ============================================================
   ENTRYPOINT
   ============================================================ */
new NEXORA();
