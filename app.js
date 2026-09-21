/* ============================================================
   NEXORA — единый app.js
   Всё: Supabase, auth, чаты, realtime, storage, UI.
   ============================================================ */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
const ATTACH_MAX = 50 * 1024 * 1024;
const STICKER_MAX = 2 * 1024 * 1024;
const POLL_MS = 2500;
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "😮", "😢"];

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
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Вчера " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { day: "2-digit", month: "short" });
  } catch { return ""; }
}

function formatDateLabel(iso) {
  const d = new Date(iso); const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Сегодня";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

function humanSize(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

/* ---------- Markdown (безопасный) ---------- */
function renderMarkdown(raw) {
  let t = escapeHtml(raw);
  t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^\n*]+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^\n*]+?)\*(?!\*)/g, "$1<em>$2</em>");
  t = t.replace(/~~([^\n~]+?)~~/g, "<del>$1</del>");
  t = t.replace(/(^|\n)&gt;\s?(.+)/g, "$1<blockquote>$2</blockquote>");

  // [text](url)
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    const safe = safeUrl(url); if (!safe) return label;
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
  });

  // autolink обычных URL вне уже созданных <a>
  const parts = []; let last = 0;
  const linkRe = /<a [^>]*>.*?<\/a>/g; let m;
  while ((m = linkRe.exec(t)) !== null) {
    parts.push(autolink(t.slice(last, m.index)));
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  parts.push(autolink(t.slice(last)));
  t = parts.join("").replace(/\n/g, "<br>");
  return t;
}
function autolink(seg) {
  return seg.replace(/(^|[\s>])((?:https?:\/\/)[^\s<]+)/g, (_, p, url) => {
    const safe = safeUrl(url); if (!safe) return p + url;
    return `${p}<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`;
  });
}

/* ---------- Toast ---------- */
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

/* ---------- Avatar ---------- */
function avatarHTML(user, size = "md") {
  const name = (user?.username || "?").trim();
  const initial = name ? name[0].toUpperCase() : "?";
  const cls = `avatar avatar-${size}`;
  if (user?.avatar_url) {
    const safe = safeUrl(user.avatar_url);
    if (safe) return `<div class="${cls}" style="background-image:url('${safe}')"></div>`;
  }
  return `<div class="${cls}">${escapeHtml(initial)}</div>`;
}
function paintAvatar(el, user) {
  if (!el) return;
  const name = (user?.username || "?").trim();
  const initial = name ? name[0].toUpperCase() : "?";
  if (user?.avatar_url) {
    const safe = safeUrl(user.avatar_url);
    if (safe) { el.style.backgroundImage = `url('${safe}')`; el.textContent = ""; return; }
  }
  el.style.backgroundImage = "";
  el.textContent = initial;
}

/* ---------- Emoji / stickers ---------- */
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

/* ============================================================
   NEXORA — главный класс приложения
   ============================================================ */
class NEXORA {
  constructor() {
    this.user = null;         // auth.user
    this.profile = null;      // profiles row
    this.chats = [];
    this.contacts = [];
    this.activeTab = "chats";
    this.activeChat = null;   // chat object
    this.activePeer = null;
    this.messages = [];
    this.members = [];        // участники активного чата
    this.reactions = {};      // message_id -> { emoji: [user_ids] }
    this.pendingAttachment = null;
    this.realtimeChannel = null;
    this.pollTimer = null;
    this.presenceTimer = null;
    this.searchTimeout = null;

    this.bindGlobalEvents();
  }

  /* ---------- Helpers ---------- */
  emailFromUsername(u) { return `${u.trim().toLowerCase()}@${VIRTUAL_DOMAIN}`; }

  showScreen(id) {
    $$(".screen").forEach(s => s.classList.remove("active"));
    $(id).classList.add("active");
  }

  /* ---------- Boot ---------- */
  async boot() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        this.user = session.user;
        await this.loadProfile();
        if (this.profile) return this.enterApp();
      }
    } catch (e) { console.error(e); }
    this.showScreen("screen-auth");
    this.showAuthCard("login");
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
        email: this.emailFromUsername(u),
        password: p1,
        options: { data: { username: u.toLowerCase() } },
      });
      if (error) throw error;
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        throw new Error("Такой nickname уже занят");
      }
      toast("Аккаунт создан. Входим…", "success");
      // сразу логинимся
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
    if (!u || !p) { if (!silent) this.showError("login-error", "Введи nickname и пароль"); return; }

    const btn = $("btn-login");
    if (!silent) { btn.disabled = true; btn.textContent = "Входим…"; }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: this.emailFromUsername(u), password: p,
      });
      if (error) throw error;
      this.user = data.user;

      // Проверка 2FA
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
      } catch (_) { /* если MFA нет — идём дальше */ }

      await this.loadProfile();
      toast("Добро пожаловать!", "success");
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
      toast("Проверено", "success");
      this.enterApp();
    } catch (e) {
      this.showError("mfa-error", e.message || "Неверный код");
    } finally {
      btn.disabled = false; btn.textContent = "Verify";
    }
  }

  async logout() {
    if (!confirm("Выйти из NEXORA?")) return;
    try { await this.setOnline(false); } catch (_) {}
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
     PROFILE
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
        is_online: online,
        last_seen: new Date().toISOString(),
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

  async uploadAvatar(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) throw new Error("Только изображения");
    if (file.size > AVATAR_MAX) throw new Error("Максимум 2 MB");
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${this.user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const url = pub.publicUrl + "?t=" + Date.now();
    await this.updateProfile({ avatar_url: url });
    return url;
  }

  /* ============================================================
     ENTER APP
     ============================================================ */
  async enterApp() {
    this.showScreen("screen-app");
    this.renderSidebarFooter();
    this.startPresence();

    await this.refreshChats();
    await this.refreshContacts();
    this.subscribeProfiles();

    // welcome by default
    $("chat-view").classList.add("hidden");
    $("welcome").classList.remove("hidden");
    $("panel").classList.add("hidden");
  }

  renderSidebarFooter() {
    const me = this.profile;
    $("me-name").textContent = me.username;
    $("me-id").textContent = me.nexora_id;
    paintAvatar($("me-avatar"), me);
  }

  /* ============================================================
     SIDEBAR TABS
     ============================================================ */
  setTab(tab) {
    this.activeTab = tab;
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    this.renderSidebarList();
  }

  renderSidebarList() {
    const list = $("sidebar-list");
    list.innerHTML = "";

    if (this.activeTab === "chats") return this.renderChatsList(list);
    if (this.activeTab === "favorites") return this.renderFavoritesList(list);
    if (this.activeTab === "contacts") return this.renderContactsList(list);
  }

  renderChatsList(container) {
    if (!this.chats.length) {
      container.innerHTML = `<div class="empty-state">Пока нет чатов.<br>Найди пользователя по NEXORA ID или нажми ＋.</div>`;
      return;
    }
    this.chats.forEach(chat => {
      const div = document.createElement("div");
      div.className = "list-item" + (this.activeChat?.id === chat.id ? " active" : "");
      const peer = chat.peer || {};
      const title = chat.display_title || peer.username || chat.title || "Chat";
      const last = chat.last_message;
      let sub = "Нет сообщений";
      if (last) {
        const icon = { image: "🖼️ ", video: "🎬 ", file: "📎 ", sticker: "🎨 " }[last.kind] || "";
        sub = (last.is_own ? "Ты: " : "") + icon + (last.content || "").slice(0, 60);
      }
      const badge = chat.type === "channel" ? "📢 " : chat.type === "group" ? "👥 " : "";
      div.innerHTML = `
        ${avatarHTML(peer, "md")}
        <div class="list-item-body">
          <div class="list-item-title">
            <span>${escapeHtml(badge + title)}</span>
            <span class="time">${last ? formatTime(last.created_at) : ""}</span>
          </div>
          <div class="list-item-sub">${escapeHtml(sub)}</div>
        </div>`;
      div.addEventListener("click", () => this.openChat(chat));
      container.appendChild(div);
    });
  }

  renderContactsList(container) {
    if (!this.contacts.length) {
      container.innerHTML = `<div class="empty-state">Нет контактов.<br>Найди пользователя по NEXORA ID.</div>`;
      return;
    }
    this.contacts.forEach(c => {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = `
        ${avatarHTML(c, "md")}
        <div class="list-item-body">
          <div class="list-item-title"><span>${escapeHtml(c.username)}</span></div>
          <div class="list-item-sub">${escapeHtml(c.nexora_id)}</div>
        </div>`;
      div.addEventListener("click", () => this.openDirectChat(c));
      container.appendChild(div);
    });
  }

  async renderFavoritesList(container) {
    container.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
    try {
      const { data, error } = await supabase
        .from("favorites")
        .select("id, message_id, chat_id, note, created_at, messages(id, content, kind, created_at, attachment_url)")
        .eq("owner_id", this.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      container.innerHTML = "";
      if (!data.length) {
        container.innerHTML = `<div class="empty-state">Пока нет избранного.<br>ПКМ по сообщению → ⭐ Сохранить.</div>`;
        return;
      }
      data.forEach(f => {
        const m = f.messages || {};
        let content = (m.content || "").trim();
        const kind = m.kind || "text";
        if (kind === "image") content = "🖼️ " + content;
        else if (kind === "video") content = "🎬 " + content;
        else if (kind === "file") content = "📎 " + content;
        else if (kind === "sticker") content = "🎨 стикер";
        const div = document.createElement("div");
        div.className = "list-item";
        div.innerHTML = `
          <div class="avatar avatar-md">⭐</div>
          <div class="list-item-body">
            <div class="list-item-title"><span>${escapeHtml(content.slice(0, 60) || "(пусто)")}</span></div>
            <div class="list-item-sub">${escapeHtml(formatTime(m.created_at))}</div>
          </div>`;
        div.addEventListener("click", () => this.openChatById(f.chat_id));
        container.appendChild(div);
      });
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div class="empty-state">Ошибка загрузки избранного.</div>`;
    }
  }

  /* ============================================================
     SEARCH
     ============================================================ */
  async searchUser(query) {
    const q = (query || "").trim();
    if (!q) return;
    const list = $("sidebar-list");
    list.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
    try {
      const { data, error } = await supabase.rpc("search_user", { query: q });
      if (error) throw error;
      list.innerHTML = "";
      if (!data || !data.length) {
        list.innerHTML = `<div class="empty-state">Пользователь не найден: ${escapeHtml(q)}</div>`;
        return;
      }
      const u = data[0];
      if (u.id === this.user.id) {
        list.innerHTML = `<div class="empty-state">Это ты 🙂</div>`;
        return;
      }
      const card = document.createElement("div");
      card.className = "user-card";
      card.innerHTML = `
        ${avatarHTML(u, "md")}
        <div class="user-card-body">
          <div class="user-card-name">${escapeHtml(u.username)}</div>
          <div class="user-card-id">${escapeHtml(u.nexora_id)}</div>
        </div>
        <button class="btn btn-primary">Написать</button>`;
      card.querySelector("button").addEventListener("click", async () => {
        try { await this.addContact(u.id); } catch (_) {}
        await this.openDirectChat(u);
      });
      list.appendChild(card);
    } catch (e) {
      console.error(e);
      list.innerHTML = `<div class="empty-state">Ошибка поиска.</div>`;
    }
  }

  /* ============================================================
     CONTACTS
     ============================================================ */
  async refreshContacts() {
    try {
      const { data, error } = await supabase
        .from("contacts")
        .select("contact_id, profile:profiles!contacts_contact_id_fkey(*)")
        .eq("owner_id", this.user.id);
      if (error) throw error;
      this.contacts = (data || []).map(r => r.profile).filter(Boolean);
    } catch (e) { console.error("refreshContacts:", e); this.contacts = []; }
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
        .from("chat_members").select("chat_id").eq("user_id", this.user.id);
      const ids = (mem || []).map(m => m.chat_id);
      if (!ids.length) { this.chats = []; if (this.activeTab === "chats") this.renderSidebarList(); return; }

      const [{ data: chats }, { data: members }, { data: msgs }] = await Promise.all([
        supabase.from("chats").select("id, is_group, title, type, description, avatar_url, updated_at, owner_id").in("id", ids),
        supabase.from("chat_members").select("chat_id, user_id, role, profile:profiles!chat_members_user_id_fkey(id, username, nexora_id, avatar_url, is_online, show_online, is_bot)").in("chat_id", ids),
        supabase.from("messages").select("chat_id, content, kind, created_at, sender_id").in("chat_id", ids).order("created_at", { ascending: false }).limit(300),
      ]);

      const lastByChat = {};
      (msgs || []).forEach(m => { if (!lastByChat[m.chat_id]) lastByChat[m.chat_id] = m; });

      this.chats = (chats || []).map(c => {
        const mems = (members || []).filter(m => m.chat_id === c.id);
        const other = mems.find(m => m.user_id !== this.user.id);
        const myMem = mems.find(m => m.user_id === this.user.id);
        const peer = other?.profile || null;
        const last = lastByChat[c.id];
        const ctype = c.type || (c.is_group ? "group" : "direct");
        return {
          id: c.id,
          is_group: c.is_group,
          type: ctype,
          title: c.title,
          description: c.description,
          avatar_url: c.avatar_url,
          owner_id: c.owner_id,
          updated_at: c.updated_at,
          my_role: myMem?.role || "member",
          peer,
          display_title: peer?.username || c.title || "Chat",
          members_count: mems.length,
          last_message: last ? {
            content: last.content || "",
            kind: last.kind || "text",
            created_at: last.created_at,
            is_own: last.sender_id === this.user.id,
          } : null,
        };
      }).sort((a, b) => {
        const ta = a.last_message?.created_at || a.updated_at || "";
        const tb = b.last_message?.created_at || b.updated_at || "";
        return new Date(tb) - new Date(ta);
      });

      if (this.activeTab === "chats") this.renderSidebarList();
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
      await this.refreshChats();
      const chat = this.chats.find(c => c.id === data) || {
        id: data, type: "direct", peer, display_title: peer.username, members_count: 2,
      };
      this.openChat(chat);
    } catch (e) {
      console.error(e);
      toast("Не удалось открыть чат", "error");
    }
  }

  async openChatById(chatId) {
    await this.refreshChats();
    const chat = this.chats.find(c => c.id === chatId);
    if (chat) this.openChat(chat);
  }

  async openChat(chat) {
    this.hidePanel();
    this.activeChat = chat;
    this.activePeer = chat.peer || null;

    $("welcome").classList.add("hidden");
    $("chat-view").classList.remove("hidden");

    // header
    const ctype = chat.type || "direct";
    const badge = ctype === "channel" ? "📢 " : ctype === "group" ? "👥 " : "";
    $("chat-peer-name").innerHTML = `${escapeHtml(badge + chat.display_title)}
      <span class="online-dot${this.isPeerOnline(chat) ? " online" : ""}"></span>`;
    $("chat-peer-sub").textContent = chat.peer?.nexora_id || (chat.members_count ? `${chat.members_count} участников` : "");
    paintAvatar($("chat-peer-avatar"), chat.peer || { username: chat.display_title });

    // composer enable/disable
    const blocked = ctype === "channel" && !["owner", "admin"].includes(chat.my_role);
    $("composer").disabled = blocked;
    $("btn-send").disabled = blocked;
    $("btn-attach").disabled = blocked;
    $("btn-emoji").disabled = blocked;
    $("composer").placeholder = blocked ? "Писать могут только админы" : "Напиши сообщение…";

    // close mobile sidebar
    if (window.innerWidth <= 860) $("sidebar").classList.add("hidden-mobile");

    this.stopRealtime();
    await this.loadMembers();
    await this.loadMessages();
    this.loadReactions();
    this.renderMessages();
    this.subscribeChat(chat.id);
    this.startPolling(chat.id);
  }

  isPeerOnline(chat) {
    if (!chat.peer) return false;
    return !!(chat.peer.is_online && chat.peer.show_online !== false);
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
      .select("id, chat_id, sender_id, content, kind, sticker_id, attachment_url, attachment_type, file_name, file_size, edited_at, created_at")
      .eq("chat_id", this.activeChat.id)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) { console.error(error); this.messages = []; return; }
    this.messages = data || [];
  }

  async loadReactions() {
    try {
      const { data, error } = await supabase
        .from("reactions")
        .select("message_id, user_id, emoji, messages!inner(chat_id)")
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

  /* ============================================================
     MESSAGES RENDER
     ============================================================ */
  renderMessages() {
    const box = $("messages");
    box.innerHTML = "";
    if (!this.messages.length) {
      box.innerHTML = `<div class="empty-state">Нет сообщений. Напиши первое!</div>`;
      return;
    }
    let prev = null;
    this.messages.forEach(m => {
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

    const row = document.createElement("div");
    row.className = "msg-row" + (isOwn ? " own" : "");
    row.dataset.messageId = m.id;
    row.dataset.senderId = m.sender_id;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    // Header (для чужих в группах/каналах)
    const ctype = this.activeChat.type || "direct";
    if (!isOwn && ctype !== "direct") {
      const h = document.createElement("div");
      h.className = "msg-sender";
      h.textContent = senderName;
      bubble.appendChild(h);
    }

    // Content
    const content = document.createElement("div");
    content.className = "msg-content";
    this.renderMessageContent(content, m);
    bubble.appendChild(content);

    // Reactions
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

    // Meta
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.innerHTML = `${m.edited_at ? '<span class="msg-edited">(изменено)</span>' : ""}
      <span>${escapeHtml(formatTime(m.created_at))}</span>`;
    bubble.appendChild(meta);

    row.appendChild(bubble);

    // Context menu (правый клик)
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.openMessageContextMenu(e, m, isOwn);
    });

    return row;
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
        const c = document.createElement("div");
        c.innerHTML = renderMarkdown(m.content);
        el.appendChild(c);
      }
      return;
    }

    if (kind === "image" && m.attachment_url) {
      const a = document.createElement("a");
      a.href = "javascript:void(0)";
      const img = document.createElement("img");
      img.className = "msg-image"; img.src = m.attachment_url; img.loading = "lazy"; img.alt = m.file_name || "image";
      img.addEventListener("click", () => this.openLightbox(m.attachment_url, "image"));
      a.appendChild(img);
      el.appendChild(a);
      if ((m.content || "").trim()) {
        const c = document.createElement("div");
        c.innerHTML = renderMarkdown(m.content);
        el.appendChild(c);
      }
      return;
    }

    if (kind === "video" && m.attachment_url) {
      const v = document.createElement("video");
      v.className = "msg-video"; v.src = m.attachment_url; v.controls = true; v.preload = "metadata";
      el.appendChild(v);
      if ((m.content || "").trim()) {
        const c = document.createElement("div");
        c.innerHTML = renderMarkdown(m.content);
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
        <div class="msg-file-icon">📄</div>
        <div>
          <div class="msg-file-name">${escapeHtml(m.file_name || "Файл")}</div>
          <div class="msg-file-size">${escapeHtml(humanSize(m.file_size))}</div>
        </div>`;
      el.appendChild(a);
      if ((m.content || "").trim()) {
        const c = document.createElement("div");
        c.innerHTML = renderMarkdown(m.content);
        el.appendChild(c);
      }
      return;
    }

    // default text
    el.innerHTML = renderMarkdown(m.content || "");
  }

  /* ============================================================
     CONTEXT MENU
     ============================================================ */
  openMessageContextMenu(event, msg, isOwn) {
    this.closeContextMenu();
    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.id = "ctx-menu";

    // quick reactions row
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

    if (isOwn && (msg.kind || "text") === "text") mk("✎ Изменить", () => this.editMessage(msg));
    mk("📋 Копировать", () => {
      const text = msg.content || msg.attachment_url || "";
      navigator.clipboard.writeText(text).then(() => toast("Скопировано", "success"));
    });
    mk("⭐ Сохранить в избранное", () => this.saveToFavorites(msg));
    if (isOwn) mk("🗑 Удалить", () => this.deleteMessage(msg), true);

    document.body.appendChild(menu);
    const rect = event.target.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = Math.min(rect.right - mw, window.innerWidth - mw - 10);
    let top = rect.bottom + 6;
    if (top + mh > window.innerHeight) top = rect.top - mh - 6;
    if (left < 10) left = 10;
    menu.style.left = left + "px";
    menu.style.top = top + "px";

    setTimeout(() => document.addEventListener("click", this.closeContextMenu, { once: true }), 0);
  }

  closeContextMenu() {
    const m = $("ctx-menu");
    if (m) m.remove();
  }

  /* ============================================================
     MESSAGES ACTIONS
     ============================================================ */
  async sendCurrent() {
    const input = $("composer");
    const text = input.value.trim();
    const att = this.pendingAttachment;
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
        };
        this.pendingAttachment = null;
        this.hideAttachBar();
      } else {
        payload = {
          chat_id: this.activeChat.id, sender_id: this.user.id,
          content: text, kind: "text",
        };
      }
      const { data, error } = await supabase.from("messages").insert(payload).select().single();
      if (error) throw error;
      if (!this.messages.find(m => m.id === data.id)) {
        this.messages.push(data);
        this.renderMessages();
      }
      this.refreshChats();
    } catch (e) {
      console.error(e);
      toast("Не удалось отправить", "error");
    }
  }

  async sendSticker(stickerId, stickerUrl) {
    if (!this.activeChat) return;
    try {
      const payload = {
        chat_id: this.activeChat.id, sender_id: this.user.id,
        content: "", kind: "sticker", sticker_id: stickerId,
      };
      if (!stickerId.startsWith("sys-")) payload.attachment_url = stickerUrl;
      const { data, error } = await supabase.from("messages").insert(payload).select().single();
      if (error) throw error;
      if (!this.messages.find(m => m.id === data.id)) {
        this.messages.push(data); this.renderMessages();
      }
      this.refreshChats();
    } catch (e) { console.error(e); toast("Ошибка стикера", "error"); }
  }

  async editMessage(msg) {
    const newText = prompt("Новый текст:", msg.content);
    if (newText === null) return;
    if (!newText.trim()) return;
    try {
      const { data, error } = await supabase
        .from("messages")
        .update({ content: newText.trim(), edited_at: new Date().toISOString() })
        .eq("id", msg.id).select().single();
      if (error) throw error;
      const i = this.messages.findIndex(m => m.id === msg.id);
      if (i >= 0) this.messages[i] = data;
      this.renderMessages();
      toast("Изменено", "success");
    } catch (e) { toast("Ошибка", "error"); }
  }

  async deleteMessage(msg) {
    if (!confirm("Удалить сообщение?")) return;
    try {
      const { error } = await supabase.from("messages").delete().eq("id", msg.id);
      if (error) throw error;
      this.messages = this.messages.filter(m => m.id !== msg.id);
      this.renderMessages();
      toast("Удалено", "success");
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
      await this.loadReactions();
      this.renderMessages();
    } catch (e) { console.error(e); }
  }

  async saveToFavorites(msg) {
    try {
      const { error } = await supabase.from("favorites").insert({
        owner_id: this.user.id, message_id: msg.id, chat_id: this.activeChat.id,
      });
      if (error && error.code !== "23505") throw error;
      toast("Сохранено в избранное", "success");
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
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
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
     EMOJI / STICKERS PICKER
     ============================================================ */
  openPicker() {
    const existing = $("picker");
    if (existing) { existing.remove(); return; }

    const picker = document.createElement("div");
    picker.id = "picker";
    picker.className = "picker";

    const tabs = document.createElement("div");
    tabs.className = "picker-tabs";
    picker.appendChild(tabs);

    const body = document.createElement("div");
    body.className = "picker-body";
    picker.appendChild(body);

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
      const t = addTab(cat, () => renderEmojiCat(cat));
      if (idx === 0) { t.classList.add("active"); renderEmojiCat(cat); }
    });

    addTab("🎨 Стикеры", () => renderStickers());

    function renderEmojiCat(cat) {
      body.className = "picker-body";
      body.innerHTML = "";
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
      body.className = "picker-body stickers";
      body.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
      body.innerHTML = "";
      SYSTEM_STICKERS.forEach(s => {
        const t = document.createElement("div");
        t.className = "picker-sticker";
        const img = document.createElement("img"); img.src = s.url; img.alt = s.name;
        t.appendChild(img);
        t.addEventListener("click", () => { picker.remove(); this.sendSticker(s.id, s.url); });
        body.appendChild(t);
      });
      try {
        const { data: custom } = await supabase.from("stickers")
          .select("id, name, url").order("created_at", { ascending: false });
        (custom || []).forEach(s => {
          const t = document.createElement("div");
          t.className = "picker-sticker";
          const img = document.createElement("img"); img.src = s.url; img.alt = s.name;
          t.appendChild(img);
          t.addEventListener("click", () => { picker.remove(); this.sendSticker(s.id, s.url); });
          body.appendChild(t);
        });
      } catch (_) {}
    }

    setTimeout(() => {
      document.addEventListener("click", (ev) => {
        if (!picker.contains(ev.target) && !ev.target.closest("#btn-emoji")) picker.remove();
      }, { once: true });
    }, 0);
  }

  /* ============================================================
     REALTIME
     ============================================================ */
  subscribeChat(chatId) {
    this.realtimeChannel = supabase.channel("chat:" + chatId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (p) => this.onRealtimeInsert(p.new))
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (p) => this.onRealtimeUpdate(p.new))
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (p) => this.onRealtimeDelete(p.old))
      .subscribe();
  }

  subscribeProfiles() {
    supabase.channel("profiles-watch")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (p) => this.onProfileUpdate(p.new))
      .subscribe();
  }

  stopRealtime() {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  onRealtimeInsert(m) {
    if (!this.activeChat || m.chat_id !== this.activeChat.id) { this.refreshChats(); return; }
    if (m.sender_id === this.user.id) return;
    if (this.messages.find(x => x.id === m.id)) return;
    this.messages.push(m);
    this.renderMessages();
    this.refreshChats();
  }

  onRealtimeUpdate(m) {
    if (!this.activeChat || m.chat_id !== this.activeChat.id) return;
    const i = this.messages.findIndex(x => x.id === m.id);
    if (i >= 0) { this.messages[i] = m; this.renderMessages(); }
  }

  onRealtimeDelete(m) {
    if (!this.activeChat) return;
    this.messages = this.messages.filter(x => x.id !== m.id);
    this.renderMessages();
  }

  onProfileUpdate(p) {
    if (this.activePeer && this.activePeer.id === p.id) {
      Object.assign(this.activePeer, p);
      if (this.activeChat) {
        const badge = this.activeChat.type === "channel" ? "📢 " : this.activeChat.type === "group" ? "👥 " : "";
        $("chat-peer-name").innerHTML = `${escapeHtml(badge + (this.activeChat.display_title || p.username))}
          <span class="online-dot${this.isPeerOnline(this.activeChat) ? " online" : ""}"></span>`;
      }
    }
    const c = this.contacts.find(c => c.id === p.id);
    if (c) Object.assign(c, p);
    this.chats.forEach(ch => { if (ch.peer?.id === p.id) Object.assign(ch.peer, p); });
    if (this.activeTab === "chats" || this.activeTab === "contacts") this.renderSidebarList();
  }

  /* ============================================================
     POLLING fallback (на случай если realtime молчит)
     ============================================================ */
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
          data.forEach(m => {
            if (!this.messages.find(x => x.id === m.id)) this.messages.push(m);
          });
          lastIso = data[data.length - 1].created_at;
          this.renderMessages();
        }
      } catch (_) {}
    }, POLL_MS);
  }
  stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  /* ============================================================
     PANELS (Profile / Settings / Chat Info / New Chat)
     ============================================================ */
  showPanel(title, bodyBuilder) {
    $("panel").classList.remove("hidden");
    $("panel-title").textContent = title;
    const body = $("panel-body");
    body.innerHTML = "";
    bodyBuilder(body);
  }
  hidePanel() { $("panel").classList.add("hidden"); }

  openSettings() {
    this.showPanel("Настройки", (body) => {
      // Account
      body.appendChild(this.section("👤 Аккаунт", [
        this.row("Username", this.profile.username, () => this.changeUsername()),
        this.row("NEXORA ID", this.profile.nexora_id, () => {
          navigator.clipboard.writeText(this.profile.nexora_id);
          toast("ID скопирован", "success");
        }, "Copy"),
      ]));

      // Security
      body.appendChild(this.section("🔒 Безопасность", [
        this.row("Пароль", "Изменить пароль", () => this.changePassword()),
        this.row("2FA", "TOTP-аутентификация", () => this.toggle2FA()),
      ]));

      // Appearance
      const current = localStorage.getItem("nexora-theme") || "dark";
      const appearance = document.createElement("div");
      appearance.className = "settings-section";
      appearance.innerHTML = `<h3>🎨 Внешний вид</h3>`;
      const themeRow = document.createElement("div");
      themeRow.className = "settings-row";
      themeRow.innerHTML = `<div class="settings-row-info">
        <div class="settings-row-label">Тема</div>
        <div class="settings-row-desc">Тёмная / Светлая / Системная</div>
      </div>`;
      const themeBox = document.createElement("div");
      themeBox.style.display = "flex"; themeBox.style.gap = "6px";
      ["dark", "light", "system"].forEach(t => {
        const b = document.createElement("button");
        b.className = "btn " + (current === t ? "btn-primary" : "btn-ghost");
        b.textContent = t[0].toUpperCase() + t.slice(1);
        b.addEventListener("click", () => {
          this.applyTheme(t);
          themeBox.querySelectorAll("button").forEach(x => x.className = "btn btn-ghost");
          b.className = "btn btn-primary";
          toast("Тема: " + t, "success");
        });
        themeBox.appendChild(b);
      });
      themeRow.appendChild(themeBox);
      appearance.appendChild(themeRow);
      body.appendChild(appearance);

      // Privacy
      const privacy = document.createElement("div");
      privacy.className = "settings-section";
      privacy.innerHTML = `<h3>🛡 Приватность</h3>`;
      privacy.appendChild(this.toggleRow("Показывать онлайн-статус", this.profile.show_online, (v) => {
        this.updateProfile({ show_online: v }).then(() => toast("Сохранено", "success"));
      }));
      privacy.appendChild(this.toggleRow("Можно найти по NEXORA ID", this.profile.findable, (v) => {
        this.updateProfile({ findable: v }).then(() => toast("Сохранено", "success"));
      }));
      body.appendChild(privacy);

      // About
      const about = document.createElement("div");
      about.className = "settings-section";
      about.innerHTML = `<h3>ℹ О приложении</h3>
        <div style="color:var(--text-0);font-weight:700">NEXORA</div>
        <div style="color:var(--text-2);font-size:13px;margin-top:4px">Connect without limits.</div>
        <div style="color:var(--text-3);font-size:12px;margin-top:6px">Version 2.0</div>`;
      body.appendChild(about);

      // Logout
      const out = document.createElement("button");
      out.className = "btn btn-danger";
      out.textContent = "Выйти из аккаунта";
      out.addEventListener("click", () => this.logout());
      body.appendChild(out);
    });
  }

  openProfile() {
    this.showPanel("Профиль", (body) => {
      const hero = document.createElement("div");
      hero.className = "profile-hero";
      hero.innerHTML = `
        ${avatarHTML(this.profile, "xl")}
        <div class="profile-hero-name">${escapeHtml(this.profile.username)}</div>
        <div class="profile-hero-id" id="profile-id">${escapeHtml(this.profile.nexora_id)}</div>`;
      body.appendChild(hero);
      hero.querySelector("#profile-id").addEventListener("click", () => {
        navigator.clipboard.writeText(this.profile.nexora_id);
        toast("ID скопирован", "success");
      });

      // Avatar change
      const uploadBtn = document.createElement("button");
      uploadBtn.className = "btn btn-primary btn-block";
      uploadBtn.textContent = "📷 Загрузить аватар";
      uploadBtn.addEventListener("click", () => $("file-avatar").click());
      body.appendChild(uploadBtn);

      // Username
      const unameSec = document.createElement("div");
      unameSec.className = "settings-section";
      unameSec.innerHTML = `<h3>Username</h3>`;
      const unameInput = document.createElement("input");
      unameInput.value = this.profile.username;
      unameInput.maxLength = 24;
      const unameSave = document.createElement("button");
      unameSave.className = "btn btn-primary";
      unameSave.textContent = "Сохранить";
      unameSave.style.marginTop = "10px";
      unameSave.addEventListener("click", async () => {
        const v = unameInput.value.trim();
        if (!/^[a-zA-Z0-9_]{3,24}$/.test(v)) return toast("3–24 символа, буквы/цифры/_", "warning");
        try {
          await this.updateProfile({ username: v });
          this.renderSidebarFooter();
          toast("Username обновлён", "success");
        } catch (e) { toast(e.message || "Ошибка", "error"); }
      });
      unameSec.appendChild(unameInput);
      unameSec.appendChild(unameSave);
      body.appendChild(unameSec);

      // About
      const aboutSec = document.createElement("div");
      aboutSec.className = "settings-section";
      aboutSec.innerHTML = `<h3>О себе</h3>`;
      const ta = document.createElement("textarea");
      ta.rows = 3; ta.maxLength = 300;
      ta.value = this.profile.about || "";
      const save = document.createElement("button");
      save.className = "btn btn-primary";
      save.textContent = "Сохранить";
      save.style.marginTop = "10px";
      save.addEventListener("click", async () => {
        try {
          await this.updateProfile({ about: ta.value.slice(0, 300) });
          toast("Сохранено", "success");
        } catch (e) { toast("Ошибка", "error"); }
      });
      aboutSec.appendChild(ta);
      aboutSec.appendChild(save);
      body.appendChild(aboutSec);
    });
  }

  openChatInfo() {
    if (!this.activeChat) return;
    const ctype = this.activeChat.type || "direct";
    this.showPanel(ctype === "channel" ? "Канал" : ctype === "group" ? "Группа" : "Чат",
      async (body) => {
        const hero = document.createElement("div");
        hero.className = "profile-hero";
        hero.innerHTML = `
          ${avatarHTML(this.activePeer || { username: this.activeChat.display_title }, "lg")}
          <div class="profile-hero-name">${escapeHtml(this.activeChat.display_title)}</div>`;
        body.appendChild(hero);

        if (ctype !== "direct") {
          const info = document.createElement("div");
          info.className = "settings-section";
          info.innerHTML = `<h3>Информация</h3>
            <div style="color:var(--text-2);font-size:13px">Участников: ${this.members.length}</div>
            ${this.activeChat.description ? `<div style="color:var(--text-2);font-size:13px;margin-top:8px">${escapeHtml(this.activeChat.description)}</div>` : ""}`;
          body.appendChild(info);

          // участники
          const memSec = document.createElement("div");
          memSec.className = "settings-section";
          memSec.innerHTML = `<h3>Участники</h3>`;
          this.members.forEach(m => {
            const row = document.createElement("div");
            row.className = "settings-row";
            row.innerHTML = `
              ${avatarHTML(m, "sm")}
              <div class="settings-row-info">
                <div class="settings-row-label">${escapeHtml(m.username)}</div>
                <div class="settings-row-desc">${escapeHtml(m.nexora_id)} · ${escapeHtml(m.role)}</div>
              </div>`;
            memSec.appendChild(row);
          });
          body.appendChild(memSec);

          // invite
          const inviteBtn = document.createElement("button");
          inviteBtn.className = "btn btn-primary";
          inviteBtn.textContent = "➕ Пригласить";
          inviteBtn.addEventListener("click", () => this.openInviteDialog());
          body.appendChild(inviteBtn);

          // leave
          const leaveBtn = document.createElement("button");
          leaveBtn.className = "btn btn-danger";
          leaveBtn.style.marginTop = "10px";
          leaveBtn.textContent = "Покинуть";
          leaveBtn.addEventListener("click", async () => {
            if (!confirm("Покинуть чат?")) return;
            await supabase.from("chat_members").delete().eq("chat_id", this.activeChat.id).eq("user_id", this.user.id);
            this.hidePanel();
            $("chat-view").classList.add("hidden");
            $("welcome").classList.remove("hidden");
            this.activeChat = null;
            await this.refreshChats();
            toast("Покинул", "warning");
          });
          body.appendChild(leaveBtn);
        } else if (this.activePeer) {
          const info = document.createElement("div");
          info.className = "settings-section";
          info.innerHTML = `<h3>Профиль</h3>
            <div style="color:var(--text-3);font-family:ui-monospace,monospace">${escapeHtml(this.activePeer.nexora_id)}</div>
            ${this.activePeer.about ? `<div style="color:var(--text-2);margin-top:8px">${escapeHtml(this.activePeer.about)}</div>` : ""}`;
          body.appendChild(info);
        }
      });
  }

  /* ---------- helpers для панели ---------- */
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
      onChange(next);
    });
    r.appendChild(sw);
    return r;
  }

  /* ============================================================
     ACCOUNT ACTIONS
     ============================================================ */
  async changeUsername() {
    const v = prompt("Новый username (3–24):", this.profile.username);
    if (!v) return;
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(v)) return toast("3–24 символа, буквы/цифры/_", "warning");
    try {
      await this.updateProfile({ username: v });
      this.renderSidebarFooter();
      toast("Username обновлён", "success");
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  async changePassword() {
    const p = prompt("Новый пароль (минимум 8):");
    if (!p) return;
    if (p.length < 8) return toast("Минимум 8 символов", "warning");
    try {
      const { error } = await supabase.auth.updateUser({ password: p });
      if (error) throw error;
      toast("Пароль изменён", "success");
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
        factorType: "totp",
        friendlyName: "NEXORA TOTP",
      });
      if (error) throw error;
      this.openTotpModal(enroll);
    } catch (e) { toast(e.message || "Ошибка 2FA", "error"); }
  }

  openTotpModal(enroll) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Включение 2FA</div>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">
            Отсканируй QR в Google Authenticator / Authy, затем введи 6-значный код.
          </p>
          <div id="qr-holder" style="background:#fff;padding:12px;border-radius:10px;text-align:center"></div>
          <p style="font-size:12px;color:var(--text-3);margin:12px 0 6px">Секрет вручную:</p>
          <code style="background:var(--bg-2);padding:8px 12px;border-radius:6px;font-size:12px;display:block;word-break:break-all">${escapeHtml(enroll.totp.secret)}</code>
          <input id="totp-code" class="mfa-input" maxlength="6" inputmode="numeric" placeholder="000000" style="margin-top:14px">
          <div id="totp-error" class="form-error" style="margin-top:10px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="totp-cancel">Отмена</button>
          <button class="btn btn-primary" id="totp-verify">Проверить</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const holder = backdrop.querySelector("#qr-holder");
    const qr = enroll.totp.qr_code;
    if (typeof qr === "string" && qr.startsWith("data:")) {
      const img = document.createElement("img"); img.src = qr; img.style.maxWidth = "200px"; holder.appendChild(img);
    } else if (typeof qr === "string" && qr.startsWith("<svg")) {
      holder.innerHTML = qr;
    } else {
      holder.textContent = "QR недоступен, используй секрет";
    }

    const close = () => backdrop.remove();
    backdrop.querySelector("#totp-cancel").addEventListener("click", close);

    backdrop.querySelector("#totp-verify").addEventListener("click", async () => {
      const code = backdrop.querySelector("#totp-code").value.trim();
      const errEl = backdrop.querySelector("#totp-error");
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
        close();
      } catch (e) {
        errEl.textContent = e.message || "Неверный код";
        errEl.classList.add("show");
      }
    });
  }

  applyTheme(t) {
    if (t === "system") {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    } else {
      document.documentElement.setAttribute("data-theme", t);
    }
    localStorage.setItem("nexora-theme", t);
  }

  /* ============================================================
     NEW CHAT / INVITE
     ============================================================ */
  openNewChatDialog() {
    this.showPanel("Новый чат", (body) => {
      const typeSec = document.createElement("div");
      typeSec.className = "settings-section";
      typeSec.innerHTML = `<h3>Тип</h3>`;
      let chatType = "group";
      const typeBox = document.createElement("div");
      typeBox.style.display = "flex"; typeBox.style.gap = "8px";
      ["group", "channel"].forEach(t => {
        const b = document.createElement("button");
        b.className = "btn " + (t === "group" ? "btn-primary" : "btn-ghost");
        b.textContent = t === "group" ? "👥 Группа" : "📢 Канал";
        b.addEventListener("click", () => {
          chatType = t;
          typeBox.querySelectorAll("button").forEach(x => x.className = "btn btn-ghost");
          b.className = "btn btn-primary";
        });
        typeBox.appendChild(b);
      });
      typeSec.appendChild(typeBox);
      body.appendChild(typeSec);

      const titleSec = document.createElement("div");
      titleSec.className = "settings-section";
      titleSec.innerHTML = `<h3>Название</h3>`;
      const titleInput = document.createElement("input");
      titleInput.placeholder = "Название";
      titleInput.maxLength = 80;
      titleSec.appendChild(titleInput);
      const descInput = document.createElement("input");
      descInput.placeholder = "Описание (необязательно)";
      descInput.maxLength = 200;
      descInput.style.marginTop = "10px";
      titleSec.appendChild(descInput);
      body.appendChild(titleSec);

      const membersSec = document.createElement("div");
      membersSec.className = "settings-section";
      membersSec.innerHTML = `<h3>Участники</h3>`;
      const checks = [];
      if (!this.contacts.length) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = "Нет контактов";
        membersSec.appendChild(p);
      } else {
        this.contacts.forEach(c => {
          const row = document.createElement("label");
          row.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer";
          const cb = document.createElement("input");
          cb.type = "checkbox"; cb.value = c.id; cb.style.width = "auto";
          checks.push(cb);
          row.appendChild(cb);
          const span = document.createElement("span");
          span.innerHTML = `${escapeHtml(c.username)} <span style="color:var(--text-3);font-size:11px">${escapeHtml(c.nexora_id)}</span>`;
          row.appendChild(span);
          membersSec.appendChild(row);
        });
      }
      body.appendChild(membersSec);

      const createBtn = document.createElement("button");
      createBtn.className = "btn btn-primary btn-block";
      createBtn.textContent = "Создать";
      createBtn.addEventListener("click", async () => {
        const title = titleInput.value.trim();
        if (!title) return toast("Введи название", "warning");
        const ids = checks.filter(c => c.checked).map(c => c.value);
        try {
          const { data, error } = await supabase.rpc("create_group_chat", {
            p_title: title,
            p_member_ids: ids,
            p_type: chatType,
            p_description: descInput.value.trim() || null,
          });
          if (error) throw error;
          toast(chatType === "channel" ? "Канал создан" : "Группа создана", "success");
          await this.refreshChats();
          this.hidePanel();
          await this.openChatById(data);
        } catch (e) { toast(e.message || "Ошибка", "error"); }
      });
      body.appendChild(createBtn);
    });
  }

  openInviteDialog() {
    const existing = new Set(this.members.map(m => m.user_id));
    const candidates = this.contacts.filter(c => !existing.has(c.id));
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header"><div class="modal-title">Пригласить</div></div>
        <div class="modal-body" id="invite-body"></div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
    const body = backdrop.querySelector("#invite-body");
    if (!candidates.length) {
      body.innerHTML = `<p class="muted">Все контакты уже в чате</p>`;
      return;
    }
    candidates.forEach(c => {
      const row = document.createElement("div");
      row.className = "settings-row";
      row.innerHTML = `<div class="settings-row-info">
        <div class="settings-row-label">${escapeHtml(c.username)}</div>
        <div class="settings-row-desc">${escapeHtml(c.nexora_id)}</div>
      </div>`;
      const b = document.createElement("button");
      b.className = "btn btn-primary"; b.textContent = "Пригласить";
      b.addEventListener("click", async () => {
        try {
          const { error } = await supabase.rpc("add_chat_member", {
            p_chat_id: this.activeChat.id, p_user_id: c.id,
          });
          if (error) throw error;
          b.textContent = "✓"; b.disabled = true;
          toast("Добавлен", "success");
        } catch (e) { toast(e.message || "Ошибка", "error"); }
      });
      row.appendChild(b);
      body.appendChild(row);
    });
  }

  /* ============================================================
     GLOBAL EVENTS BINDING
     ============================================================ */
  bindGlobalEvents() {
    window.addEventListener("DOMContentLoaded", () => {
      // Theme
      const savedTheme = localStorage.getItem("nexora-theme") || "dark";
      this.applyTheme(savedTheme);

      // Auth buttons
      $("btn-login").addEventListener("click", () => this.doLogin());
      $("btn-register").addEventListener("click", () => this.doRegister());
      $("btn-mfa").addEventListener("click", () => this.doMfaVerify());
      $("goto-register").addEventListener("click", () => this.showAuthCard("register"));
      $("goto-login").addEventListener("click", () => this.showAuthCard("login"));
      $("mfa-cancel").addEventListener("click", () => this.showAuthCard("login"));
      $("goto-forgot").addEventListener("click", () => {
        alert("Восстановление через email недоступно — аккаунт использует nickname. Обратись к администратору.");
      });
      ["login-username", "login-password"].forEach(id => {
        $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") this.doLogin(); });
      });
      $("reg-password2").addEventListener("keydown", (e) => { if (e.key === "Enter") this.doRegister(); });
      $("mfa-code").addEventListener("keydown", (e) => { if (e.key === "Enter") this.doMfaVerify(); });

      // Sidebar tabs
      $$(".tab").forEach(t => t.addEventListener("click", () => this.setTab(t.dataset.tab)));

      // Sidebar footer
      $("btn-settings").addEventListener("click", () => this.openSettings());
      $("btn-logout").addEventListener("click", () => this.logout());
      $("me-avatar").addEventListener("click", () => this.openProfile());
      $("me-name").addEventListener("click", () => this.openProfile());

      // Search
      $("search-input").addEventListener("input", (e) => {
        clearTimeout(this.searchTimeout);
        const q = e.target.value.trim();
        if (!q) { this.renderSidebarList(); return; }
        this.searchTimeout = setTimeout(() => this.searchUser(q), 300);
      });

      // New chat
      $("btn-new-chat").addEventListener("click", () => this.openNewChatDialog());

      // Composer
      const composer = $("composer");
      composer.addEventListener("input", () => {
        composer.style.height = "auto";
        composer.style.height = Math.min(composer.scrollHeight, 160) + "px";
      });
      composer.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendCurrent(); }
      });
      $("btn-send").addEventListener("click", () => this.sendCurrent());
      $("btn-attach").addEventListener("click", () => this.pickAttachment());
      $("btn-emoji").addEventListener("click", () => this.openPicker());
      $("attach-cancel").addEventListener("click", () => this.hideAttachBar());
      $("btn-chat-info").addEventListener("click", () => this.openChatInfo());
      $("chat-header-body").addEventListener("click", () => this.openChatInfo());

      // Panel close
      $("panel-back").addEventListener("click", () => this.hidePanel());

      // Mobile menu
      $("btn-mobile-menu").addEventListener("click", () => {
        $("sidebar").classList.toggle("hidden-mobile");
      });
      $("sidebar").addEventListener("click", (e) => {
        if (window.innerWidth <= 860 && e.target.closest(".list-item")) {
          $("sidebar").classList.add("hidden-mobile");
        }
      });

      // Avatar file input
      $("file-avatar").addEventListener("change", async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          toast("Загрузка…", "info");
          await this.uploadAvatar(f);
          this.renderSidebarFooter();
          toast("Аватар обновлён", "success");
        } catch (err) { toast(err.message || "Ошибка", "error"); }
      });

      // Global click — close context menu / picker
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".ctx-menu")) this.closeContextMenu();
      });

      // Boot
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
   START
   ============================================================ */
new NEXORA();