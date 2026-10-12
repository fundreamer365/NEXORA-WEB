/* ============================================================
   NEXORA — js/app.js
   Финальная тонкая обёртка. Импортирует модули и запускает.
   ============================================================ */

import { supabase, ACCOUNTS_KEY, HIDDEN_MSGS_KEY } from "./supabase.js";
import {
  $, $$, escapeHtml, safeUrl, toast, lsGet, lsSet,
  STATUS_META,
} from "./util.js";
import { Sounds } from "./sound.js";
import {
  t, currentLocale, setLocale, applyTranslations, LOCALES,
} from "../i18n.js";
import {
  getProfileTheme, applyProfileTheme,
} from "../themes.js";

/* Сервисы */
import { AuthService, emailFromUsername, validateUsername,
         loadAccounts, saveAccounts, rememberAccount, forgetAccount } from "./auth.js";
import { ProfileService, avatarHTML, paintAvatar, buildNameHTML } from "./profile.js";
import { ChatService, ContactService, BlockService } from "./chat.js";
import { RealtimeService } from "./realtime.js";
import { CommunityManager } from "./communities.js";
import { SettingsService, getUiPrefs, setUiPref } from "./settings.js";
import { EconomyService } from "./economy.js";
import { ShopService } from "./shop.js";

/* ---------- SVG icons (для списка чатов и т.д.) ---------- */
const ICONS = {
  inbox:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  channel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>',
  group:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
  star:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
};

/* ============================================================
   Главный класс NEXORA
   ============================================================ */
class NEXORA {
  constructor() {
    /* Auth / Profile */
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
    this.pollTimer = null;
    this.presenceTimer = null;
    this.searchTimeout = null;
    this.messageSearchQuery = "";
    this.theme = {};
    this._themeLoadedFor = null;
    this.virtualWindow = 60;
    this.visibleStart = 0;
    this._activeBotCommands = [];
    this._swRegistration = null;
    this._openModal = null;
    this._escHandler = null;
    this._recorder = null;
    this._chunks = [];
    this._voiceTimer = null;
    this.notificationChatId = null;

    this.icons = ICONS;
    this.sounds = Sounds;

    /* i18n / themes re-export */
    this.currentLocaleFn = currentLocale;
    this.setLocaleFn = setLocale;
    this.applyTranslationsFn = applyTranslations;
    this.LOCALES = LOCALES;

    /* Сервисы */
    this.authService = new AuthService(this);
    this.profileService = new ProfileService(this);
    this.contactService = new ContactService(this);
    this.blockService = new BlockService(this);
    this.chatService = new ChatService(this);
    this.realtimeService = new RealtimeService(this);
    this.settingsService = new SettingsService(this);
    this.economyService = new EconomyService(this);
    this.shopService = new ShopService(this);
    this.community = new CommunityManager(this);

    this.bindGlobalEvents();
  }

  /* ---------- Screens ---------- */
  showScreen(id) {
    $$(".screen").forEach((s) => s.classList.remove("active"));
    const el = $(id);
    if (el) el.classList.add("active");
  }

  /* ---------- Modal ---------- */
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
    modal.appendChild(header);
    modal.appendChild(bodyEl);
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
    this._openModal = {
      backdrop, modal, bodyEl,
      footerEl: modal.querySelector(".nx-modal-footer"),
    };
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

  closeContextMenu() {
    const m = $("ctx-menu");
    if (m) m.remove();
  }

  openLightbox(url, kind) {
    this.settingsService.openLightbox(url, kind);
  }
  setReplyTo(msg) {
    this.settingsService.setReplyTo(msg);
  }
  hideReplyPreview() {
    this.settingsService.hideReplyPreview();
  }
  hideAttachBar() {
    this.settingsService.hideAttachBar();
  }
  maybeBotReply(msg) {
    this.settingsService.maybeBotReply(msg);
  }
  applyUiPrefs() {
    this.settingsService.applyUiPrefs();
  }
  saveUiPref(key, value) {
    this.settingsService.saveUiPref(key, value);
  }
  loadChatThemes(force = false) {
    return this.settingsService.loadChatThemes(force);
  }
  applyChatThemeToUI(chatId) {
    this.settingsService.applyChatThemeToUI(chatId);
  }

  /* ---------- Shorthand methods (делегаты) ---------- */
  async loadProfile() { return this.profileService.loadProfile(); }
  async updateProfile(patch) { return this.profileService.updateProfile(patch); }
  async setOnline(online) { return this.profileService.setOnline(online); }
  startPresence() { return this.profileService.startPresence(); }
  stopPresence() { return this.profileService.stopPresence(); }
  renderSidebarFooter() { return this.profileService.renderSidebarFooter(); }

  async refreshChats() { return this.chatService.refreshChats(); }
  async refreshContacts() { return this.contactService.refreshContacts(); }
  scheduleRefreshChats(delay) { return this.realtimeService.scheduleRefreshChats(delay); }

  stopRealtime() { return this.realtimeService.stopRealtime(); }
  stopGlobalRealtime() { return this.realtimeService.stopGlobalRealtime(); }
  stopPolling() { return this.chatService.stopPolling(); }

  /* ---------- Unread ---------- */
  async loadReads() {
    try {
      const { data } = await supabase.from("chat_reads")
        .select("chat_id, last_read_at").eq("user_id", this.user.id);
      const map = {};
      (data || []).forEach((r) => { map[r.chat_id] = r.last_read_at; });
      this.reads = map;
    } catch (_) { this.reads = {}; }
  }

  async loadReadsByOther() {
    try {
      const { data: mem } = await supabase.from("chat_members")
        .select("chat_id").eq("user_id", this.user.id);
      const ids = (mem || []).map((m) => m.chat_id);
      if (!ids.length) { this.readsByOther = {}; return; }
      const { data } = await supabase.from("chat_reads")
        .select("chat_id, user_id, last_read_at")
        .in("chat_id", ids).neq("user_id", this.user.id);
      const map = {};
      (data || []).forEach((r) => {
        if (!map[r.chat_id]) map[r.chat_id] = {};
        if (!map[r.chat_id][r.user_id]
            || new Date(r.last_read_at) > new Date(map[r.chat_id][r.user_id])) {
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
        user_id: this.user.id,
        chat_id: chatId,
        last_read_at: iso,
        updated_at: iso,
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
    document.title = n > 0
      ? `(${n}) NEXORA — Connect without limits`
      : "NEXORA — Connect without limits";
  }

  setupUnreadTitleUpdater() {
    setInterval(() => this.updatePageTitle(), 5000);
  }

  isPeerOnline(chat) {
    if (!chat?.peer) return false;
    if (chat.peer.is_bot) return false;
    const st = chat.peer.status || "online";
    if (st === "invisible") return false;
    return !!(chat.peer.is_online && chat.peer.show_online !== false);
  }

  /* ---------- Sidebar ---------- */
  setTab(tab) {
    this.activeTab = tab;
    this.sounds?.click();
    $$(".tab").forEach((t2) => t2.classList.toggle("active", t2.dataset.tab === tab));
    this.renderSidebarList();
  }

  renderSidebarList() {
    const list = $("sidebar-list");
    if (!list) return;
    list.innerHTML = "";
    const prefs = getUiPrefs();
    list.classList.toggle("compact", prefs.chatListMode === "compact");
    if (this.activeTab === "chats") return this.renderChatsList(list);
    if (this.activeTab === "contacts") return this.renderContactsList(list);
  }

  renderChatsList(container) {
    if (!this.chats.length) {
      container.innerHTML = `<div class="empty-state">Пока нет чатов.<br>Найди пользователя по NEXORA ID, ник или @канал, или нажми ＋.</div>`;
      return;
    }
    this.chats.forEach((chat) => {
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
      let sub = chat.type === "saved"
        ? "Твои сохранённые сообщения"
        : chat.is_notification ? "Уведомления о входах" : "Нет сообщений";
      if (last) {
        const icon = {
          image: "🖼️ ", video: "🎬 ", file: "📎 ",
          sticker: "🎨 ", voice: "🎤 ", gif: "🎞️ ",
          poll: "📊 ", auth: "🔐 ",
        }[last.kind] || "";
        sub = (last.is_own ? "Ты: " : "") + icon + (last.content || "").slice(0, 60);
      }
      const typing = this.typingUsers[chat.id];
      const typers = typing
        ? Object.values(typing).filter((tt) => Date.now() - tt.ts < 3000)
        : [];
      if (typers.length) {
        sub = `<em>${escapeHtml(typers.map((tt) => tt.name).join(", "))} печатает…</em>`;
      }
      let badgeHTML = "";
      if (chat.is_notification) badgeHTML = `<span class="list-item-badge-icon">${ICONS.inbox}</span>`;
      else if (chat.type === "channel") badgeHTML = `<span class="list-item-badge-icon">${ICONS.channel}</span>`;
      else if (chat.type === "group") badgeHTML = `<span class="list-item-badge-icon">${ICONS.group}</span>`;
      else if (chat.type === "saved") badgeHTML = `<span class="list-item-badge-icon">${ICONS.star}</span>`;
      const botBadge = peer.is_bot ? ' <span class="bot-badge">[BOT]</span>' : "";
      const nameHTML = chat.type === "direct" && peer?.id
        ? buildNameHTML({ ...peer, username: title }, { showBadge: true })
        : escapeHtml(title);
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
            <span>${badgeHTML}${nameHTML}${botBadge}${chanTag}${ephTag}</span>
            <span class="time">${last ? formatTime(last.created_at) : ""}</span>
          </div>
          <div class="list-item-sub">${typers.length ? sub : escapeHtml(sub)}</div>
        </div>
        ${unread ? `<div class="list-item-badge">${unread}</div>` : ""}`;
      div.addEventListener("click", () => this.chatService.openChat(chat));
      div.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.openChatContextMenu(e, chat);
      });
      container.appendChild(div);
    });
  }

  renderContactsList(container) {
    if (!this.contacts.length) {
      container.innerHTML = `<div class="empty-state">Нет контактов.<br>Найди пользователя по NEXORA ID или нику.</div>`;
      return;
    }
    this.contacts.forEach((c) => {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = `${avatarHTML(c, "md")}<div class="list-item-body"><div class="list-item-title"><span>${buildNameHTML(c, { showBadge: true })}</span></div><div class="list-item-sub">${escapeHtml(c.nexora_id)}</div></div>`;
      div.addEventListener("click", () => this.profileService.openUserProfile(c.id, c));
      container.appendChild(div);
    });
  }

  openChatContextMenu(event, chat) {
    this.closeContextMenu();
    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.id = "ctx-menu";
    const mk = (label, handler, danger = false) => {
      const b = document.createElement("button");
      b.textContent = label;
      if (danger) b.classList.add("danger");
      b.addEventListener("click", () => {
        this.closeContextMenu();
        handler();
      });
      menu.appendChild(b);
    };
    if (chat.is_notification) {
      mk("🎨 Тема чата", () => this.settingsService.openChatThemePicker(chat));
    } else if (chat.type === "saved") {
      mk("🎨 Тема чата", () => this.settingsService.openChatThemePicker(chat));
    } else {
      mk("✓ Отметить прочитанным", () => this.markChatRead(chat.id));
      if (chat.type === "direct" && chat.peer) {
        mk("👤 Открыть профиль", () => this.profileService.openUserProfile(chat.peer.id, chat.peer));
      }
      if ((chat.type === "channel" || chat.type === "group")
          && (chat.my_role === "owner" || chat.my_role === "admin")) {
        if (chat.type === "channel") {
          mk("⚙ Настройки канала", () => this.openChannelSettings(chat));
        } else {
          mk("⚙ Настройки группы", () => this.openGroupSettings(chat));
        }
        mk("🔗 Поделиться ссылкой", () => this.openChannelShare(chat));
      }
      mk("🎨 Тема чата", () => this.settingsService.openChatThemePicker(chat));
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
      toast("Чат «Избранное» нельзя удалить", "warning");
      return;
    }
    if (chat.is_notification) {
      toast("Служебный чат NEXORA нельзя удалить", "warning");
      return;
    }
    if (!confirm(`Удалить чат «${chat.display_title}» только у себя?`)) return;
    try {
      await supabase.from("chat_members")
        .update({ hidden_until: new Date().toISOString() })
        .eq("chat_id", chat.id).eq("user_id", this.user.id);
      toast("Чат удалён у тебя", "warning");
      this.sounds?.click();
      await this.refreshChats();
      if (this.activeChat?.id === chat.id) {
        this.activeChat = null;
        $("chat-view").classList.add("hidden");
        $("welcome").classList.remove("hidden");
      }
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  /* ---------- Channel/Group settings ---------- */
  openChannelSettings(chat) {
    this.app = this;
    const isPublic = !!chat.is_public;
    this.openModal({
      title: "Настройки канала",
      body: (body) => {
        body.innerHTML = `
          <div class="settings-section"><h3>Название</h3><input id="cs-title" maxlength="80" value="${escapeHtml(chat.title || "")}"><textarea id="cs-desc" rows="2" maxlength="200" placeholder="Описание" style="margin-top:8px">${escapeHtml(chat.description || "")}</textarea></div>
          <div class="settings-section"><h3>Тип канала</h3><div id="cs-type" style="display:flex;gap:8px"></div><div id="cs-username-wrap" style="margin-top:12px; display:${isPublic ? "block" : "none"}"><label style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:1px">Username</label><div class="input-prefix" style="margin-top:6px"><span class="prefix">@</span><input id="cs-username" maxlength="32" value="${escapeHtml(chat.username || "")}" placeholder="my_channel"></div></div></div>
          <div id="cs-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="cs-cancel">Отмена</button>
            <button class="btn btn-primary" id="cs-save">Сохранить</button>
          </div>`;
        let picked = isPublic;
        const typeBox = body.querySelector("#cs-type");
        const unameWrap = body.querySelector("#cs-username-wrap");
        const setType = (pub) => {
          picked = pub;
          typeBox.querySelectorAll("button").forEach((b) => b.className = "btn btn-ghost");
          (pub ? typeBox.children[0] : typeBox.children[1]).className = "btn btn-primary";
          unameWrap.style.display = pub ? "block" : "none";
        };
        ["Публичный", "Приватный"].forEach((label, i) => {
          const b = document.createElement("button");
          b.className = "btn " + ((isPublic && i === 0) || (!isPublic && i === 1) ? "btn-primary" : "btn-ghost");
          b.textContent = label;
          b.addEventListener("click", () => setType(i === 0));
          typeBox.appendChild(b);
        });
        body.querySelector("#cs-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#cs-save").addEventListener("click", async () => {
          const errEl = body.querySelector("#cs-error");
          errEl.classList.remove("show");
          const title = body.querySelector("#cs-title").value.trim();
          const desc = body.querySelector("#cs-desc").value.trim();
          const uname = body.querySelector("#cs-username").value.trim().toLowerCase();
          if (!title) {
            errEl.textContent = "Введите название";
            errEl.classList.add("show");
            return;
          }
          try {
            const { error } = await supabase.rpc("update_channel_settings", {
              p_chat_id: chat.id,
              p_is_public: picked,
              p_username: picked ? uname : null,
              p_title: title,
              p_description: desc,
            });
            if (error) throw error;
            toast("Настройки сохранены", "success");
            this.sounds?.success();
            this.closeModal();
            await this.refreshChats();
          } catch (e) {
            errEl.textContent = e.message || "Ошибка";
            errEl.classList.add("show");
          }
        });
      },
    });
  }

  openGroupSettings(chat) {
    const isPublic = !!chat.is_public;
    this.openModal({
      title: "Настройки группы",
      body: (body) => {
        body.innerHTML = `
          <div class="settings-section"><h3>Название</h3><input id="gs-title" maxlength="80" value="${escapeHtml(chat.title || "")}"><textarea id="gs-desc" rows="2" maxlength="200" placeholder="Описание" style="margin-top:8px">${escapeHtml(chat.description || "")}</textarea></div>
          <div class="settings-section"><h3>Тип группы</h3><div id="gs-type" style="display:flex;gap:8px"></div><div id="gs-username-wrap" style="margin-top:12px; display:${isPublic ? "block" : "none"}"><label style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:1px">Username</label><div class="input-prefix" style="margin-top:6px"><span class="prefix">@</span><input id="gs-username" maxlength="32" value="${escapeHtml(chat.username || "")}" placeholder="my_group"></div></div></div>
          <div id="gs-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="gs-cancel">Отмена</button>
            <button class="btn btn-primary" id="gs-save">Сохранить</button>
          </div>`;
        let picked = isPublic;
        const typeBox = body.querySelector("#gs-type");
        const unameWrap = body.querySelector("#gs-username-wrap");
        const setType = (pub) => {
          picked = pub;
          typeBox.querySelectorAll("button").forEach((b) => b.className = "btn btn-ghost");
          (pub ? typeBox.children[0] : typeBox.children[1]).className = "btn btn-primary";
          unameWrap.style.display = pub ? "block" : "none";
        };
        ["Публичная", "Приватная"].forEach((label, i) => {
          const b = document.createElement("button");
          b.className = "btn " + ((isPublic && i === 0) || (!isPublic && i === 1) ? "btn-primary" : "btn-ghost");
          b.textContent = label;
          b.addEventListener("click", () => setType(i === 0));
          typeBox.appendChild(b);
        });
        body.querySelector("#gs-cancel").addEventListener("click", () => this.closeModal());
        body.querySelector("#gs-save").addEventListener("click", async () => {
          const errEl = body.querySelector("#gs-error");
          errEl.classList.remove("show");
          const title = body.querySelector("#gs-title").value.trim();
          const desc = body.querySelector("#gs-desc").value.trim();
          const uname = body.querySelector("#gs-username").value.trim().toLowerCase();
          if (!title) {
            errEl.textContent = "Введите название";
            errEl.classList.add("show");
            return;
          }
          try {
            const { error } = await supabase.rpc("update_group_settings", {
              p_chat_id: chat.id,
              p_title: title,
              p_description: desc,
              p_is_public: picked,
              p_username: picked ? uname : null,
            });
            if (error) throw error;
            toast("Настройки сохранены", "success");
            this.sounds?.success();
            this.closeModal();
            await this.refreshChats();
          } catch (e) {
            errEl.textContent = e.message || "Ошибка";
            errEl.classList.add("show");
          }
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
        body.innerHTML = `<p style="color:var(--text-2);font-size:13px;margin-bottom:10px">${chat.is_public ? `Публичный — любой найдёт по @${escapeHtml(chat.username || "")}.` : "Приватный — только по этой ссылке."}</p><div class="share-row"><span class="share-link" id="ch-share">${escapeHtml(url)}</span></div>`;
        body.querySelector("#ch-share").addEventListener("click", () => {
          navigator.clipboard.writeText(url);
          toast("Скопировано", "success");
        });
        const f = this._openModal.footerEl;
        f.innerHTML = "";
        const copy = document.createElement("button");
        copy.className = "btn btn-primary";
        copy.textContent = "Копировать ссылку";
        copy.addEventListener("click", () => {
          navigator.clipboard.writeText(url);
          toast("Скопировано", "success");
          this.sounds?.success();
        });
        f.appendChild(copy);
      },
    });
  }

  /* ---------- Search ---------- */
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
      data.forEach((u) => {
        if (u.id === this.user.id) return;
        const card = document.createElement("div");
        card.className = "user-card";
        const botTag = u.is_bot ? ' <span class="bot-badge">[BOT]</span>' : "";
        card.innerHTML = `${avatarHTML(u, "md")}<div class="user-card-body"><div class="user-card-name">${buildNameHTML(u, { showBadge: true })}${botTag}</div><div class="user-card-id">${escapeHtml(u.nexora_id)}</div></div><button class="btn btn-primary">Открыть</button>`;
        card.querySelector("button").addEventListener("click", () => this.profileService.openUserProfile(u.id, u));
        list.appendChild(card);
      });
      if (!list.children.length) {
        list.innerHTML = `<div class="empty-state">Это только ты 🙂</div>`;
      }
    } catch (e) {
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
    card.innerHTML = `<div class="avatar avatar-md">#</div><div class="user-card-body"><div class="user-card-name">${escapeHtml(ch.title)}<span class="channel-badge ${pubTag}">${pubTag}</span></div><div class="user-card-id">${unameLine} · ${ch.members_count} участников</div></div><button class="btn btn-primary">${ch.already_member ? "Открыть" : "Войти"}</button>`;
    card.querySelector("button").addEventListener("click", async () => {
      if (ch.already_member) {
        await this.refreshChats();
        await this.chatService.openChatById(ch.id);
      } else if (ch.is_public) {
        try {
          const { error } = await supabase.rpc("join_channel", { p_chat_id: ch.id });
          if (error) throw error;
          toast("Присоединились", "success");
          this.sounds?.success();
          await this.refreshChats();
          await this.chatService.openChatById(ch.id);
        } catch (e) { toast(e.message || "Ошибка", "error"); }
      }
    });
    container.appendChild(card);
  }

  /* ---------- Deep links ---------- */
  async handleDeepLink() {
    try {
      const params = new URLSearchParams(location.search);
      const chan = params.get("c");
      const usr = params.get("u");
      const chat = params.get("chat");
      const msg = params.get("msg");
      if (chat && msg) {
        await this.chatService.openChatById(chat);
        setTimeout(() => {
          const el = document.querySelector(`[data-message-id="${msg}"]`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("msg-link-highlight");
            setTimeout(() => el.classList.remove("msg-link-highlight"), 2500);
          }
        }, 400);
        return;
      }
      if (chan) {
        const ch = await this.tryFindChannel(chan.replace(/^@/, ""));
        if (ch) {
          if (ch.already_member) await this.chatService.openChatById(ch.id);
          else if (ch.is_public) {
            if (confirm(`Присоединиться к «${ch.title}»?`)) {
              try {
                await supabase.rpc("join_channel", { p_chat_id: ch.id });
                await this.refreshChats();
                await this.chatService.openChatById(ch.id);
                toast("Присоединились", "success");
              } catch (e) { toast(e.message || "Ошибка", "error"); }
            }
          }
        } else toast("Канал не найден", "warning");
      }
      if (usr) {
        const { data } = await supabase.rpc("search_user", { query: usr });
        const u = Array.isArray(data) ? data[0] : null;
        if (u && u.id !== this.user.id) this.profileService.openUserProfile(u.id, u);
      }
    } catch (_) {}
  }

  /* ---------- Notifications ---------- */
  async notify(title, body, tag = "nexora") {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (this.profile?.notifications_enabled === false) return;
    if (this.profile?.status === "dnd") return;
    const opts = {
      body,
      icon: "assets/icon-192.png",
      badge: "assets/icon-192.png",
      tag,
    };
    try {
      if (navigator.serviceWorker?.controller) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, opts);
      } else new Notification(title, opts);
    } catch (e) { console.warn("notify:", e); }
  }

  async requestNotificationPermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const res = await Notification.requestPermission();
    return res === "granted";
  }

  /* ---------- Service Worker ---------- */
  async registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      this._swRegistration = await navigator.serviceWorker.register("./sw.js");
    } catch (e) { console.warn("SW:", e); }
  }

  /* ---------- Open settings dialog (заглушка для этапа 3) ---------- */
  openSettings() {
    this.openModal({
      title: "Настройки",
      wide: true,
      body: (body) => {
        body.innerHTML = `
          <div class="settings-section">
            <h3>👤 Аккаунт</h3>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">${escapeHtml(this.profile.username)}</div><div class="settings-row-desc">${escapeHtml(this.profile.nexora_id)}</div></div>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">Экономика</div><div class="settings-row-desc">Sparks и N-Coins</div></div>
              <button class="btn btn-ghost" id="st-econ">Открыть</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">🛍 NEXORA Shop</div><div class="settings-row-desc">Косметика и темы</div></div>
              <button class="btn btn-ghost" id="st-shop">Открыть</button>
            </div>
          </div>
          <div class="settings-section">
            <h3>🎨 Профиль</h3>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">Значок</div><div class="settings-row-desc">${escapeHtml(this.profile.badge_emoji || "не выбран")}</div></div>
              <button class="btn btn-ghost" id="st-badge">Изменить</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">Обложка</div><div class="settings-row-desc">${escapeHtml(this.profile.cover_preset || "по умолчанию")}</div></div>
              <button class="btn btn-ghost" id="st-cover">Изменить</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">Статус</div><div class="settings-row-desc">${escapeHtml(STATUS_META[this.profile.status || "online"]?.label || "В сети")}</div></div>
              <button class="btn btn-ghost" id="st-status">Изменить</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">О себе</div><div class="settings-row-desc">${escapeHtml(this.profile.about || "не задано")}</div></div>
              <button class="btn btn-ghost" id="st-about">Изменить</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">Соц-ссылки</div><div class="settings-row-desc">Профиль</div></div>
              <button class="btn btn-ghost" id="st-social">Изменить</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">Тема профиля</div><div class="settings-row-desc">${escapeHtml(getProfileTheme())}</div></div>
              <button class="btn btn-ghost" id="st-theme">Изменить</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">Шрифт сообщений</div><div class="settings-row-desc">${escapeHtml(getUiPrefs().msgFont)}</div></div>
              <button class="btn btn-ghost" id="st-font">Изменить</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">Фон под сообщениями</div><div class="settings-row-desc">${escapeHtml(getUiPrefs().msgBgPattern)}</div></div>
              <button class="btn btn-ghost" id="st-pattern">Изменить</button>
            </div>
          </div>
          <div class="settings-section">
            <h3>🔒 Безопасность</h3>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">2FA</div><div class="settings-row-desc">TOTP-аутентификация</div></div>
              <button class="btn btn-ghost" id="st-2fa">Изменить</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">Пароль</div><div class="settings-row-desc">Обновить пароль</div></div>
              <button class="btn btn-ghost" id="st-pw">Изменить</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-info"><div class="settings-row-label">Сессии</div><div class="settings-row-desc">Активные устройства</div></div>
              <button class="btn btn-ghost" id="st-sessions">Открыть</button>
            </div>
          </div>
          <button class="btn btn-danger btn-block" id="st-logout">Выйти из аккаунта</button>`;

        const $el = (id) => body.querySelector("#" + id);
        $el("st-econ").addEventListener("click", () => { this.closeModal(); setTimeout(() => this.economyService.openEconomyDialog(), 100); });
        $el("st-shop").addEventListener("click", () => { this.closeModal(); setTimeout(() => this.shopService.openShopDialog(), 100); });
        $el("st-badge").addEventListener("click", () => { this.closeModal(); setTimeout(() => this.profileService.openBadgePicker(), 100); });
        $el("st-cover").addEventListener("click", () => { this.closeModal(); setTimeout(() => this.profileService.openCoverPicker(), 100); });
        $el("st-status").addEventListener("click", () => { this.closeModal(); setTimeout(() => this.profileService.openStatusPicker(), 100); });
        $el("st-about").addEventListener("click", () => { this.closeModal(); setTimeout(() => this.profileService.openAboutEditor(), 100); });
        $el("st-social").addEventListener("click", () => { this.closeModal(); setTimeout(() => this.profileService.openSocialLinksEditor(), 100); });
        $el("st-theme").addEventListener("click", () => { this.closeModal(); setTimeout(() => this.profileService.openProfileThemePicker(), 100); });
        $el("st-font").addEventListener("click", () => { this.closeModal(); setTimeout(() => this.openMsgFontPicker(), 100); });
        $el("st-pattern").addEventListener("click", () => { this.closeModal(); setTimeout(() => this.openMsgBgPatternPicker(), 100); });
        $el("st-2fa").addEventListener("click", () => this.authService.toggle2FA());
        $el("st-pw").addEventListener("click", () => this.authService.changePassword());
        $el("st-sessions").addEventListener("click", () => { this.closeModal(); setTimeout(() => this.settingsService.openSessionsDialog(), 100); });
        $el("st-logout").addEventListener("click", () => { this.closeModal(); this.authService.logout(); });
      },
    });
  }

  openMsgFontPicker() {
    this.openModal({
      title: "Шрифт сообщений",
      narrow: true,
      body: (body) => {
        body.innerHTML = `<div id="mf-list"></div>`;
        const list = body.querySelector("#mf-list");
        Object.entries({
          default: "По умолчанию",
          monospace: "Monospace",
          serif: "Serif",
          rounded: "Rounded",
        }).forEach(([key, label]) => {
          const row = document.createElement("div");
          row.className = "settings-row";
          row.style.cursor = "pointer";
          row.innerHTML = `<div class="settings-row-info"><div class="settings-row-label">${label}</div></div>`;
          if (getUiPrefs().msgFont === key) row.style.background = "var(--accent-dim)";
          row.addEventListener("click", () => {
            this.saveUiPref("msgFont", key);
            toast("Шрифт: " + label, "success");
            this.closeModal();
          });
          list.appendChild(row);
        });
      },
    });
  }

  openMsgBgPatternPicker() {
    this.openModal({
      title: "Фон под сообщениями",
      narrow: true,
      body: (body) => {
        body.innerHTML = `<div id="bp-list"></div>`;
        const list = body.querySelector("#bp-list");
        ["none", "dots", "grid", "stripes", "hearts"].forEach((p) => {
          const row = document.createElement("div");
          row.className = "settings-row";
          row.style.cursor = "pointer";
          row.innerHTML = `<div class="settings-row-info"><div class="settings-row-label">${p}</div></div>`;
          if (getUiPrefs().msgBgPattern === p) row.style.background = "var(--accent-dim)";
          row.addEventListener("click", () => {
            this.saveUiPref("msgBgPattern", p);
            toast("Фон: " + p, "success");
            this.closeModal();
          });
          list.appendChild(row);
        });
      },
    });
  }

  /* ---------- Boot / enter ---------- */
  async boot() {
    applyProfileTheme(getProfileTheme());
    this.applyUiPrefs();
    this.registerServiceWorker();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        this.user = session.user;
        await this.loadProfile();
        if (this.profile) {
          rememberAccount({
            id: this.user.id,
            username: this.profile.username,
            nexora_id: this.profile.nexora_id,
            avatar_url: this.profile.avatar_url,
          });
          try {
            await supabase.rpc("log_login_event", {
              user_agent: navigator.userAgent || "",
              ip: null,
            });
          } catch (_) {}
          return this.enterApp();
        }
      }
    } catch (e) { console.error(e); }
    this.showScreen("screen-auth");
    this.authService.showAuthCard("login");
  }

  async enterApp() {
    this.showScreen("screen-app");
    document.documentElement.setAttribute("lang", currentLocale());
    applyTranslations();
    applyProfileTheme(getProfileTheme());
    this.applyUiPrefs();
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
    await this.loadChatThemes(true);

    this.realtimeService.subscribeProfiles();
    this.realtimeService.subscribeGlobalMessages();
    this.realtimeService.subscribeGlobalChatMembers();
    this.realtimeService.subscribeGlobalChats();
    this.realtimeService.subscribeGlobalReactions();
    this.realtimeService.subscribeGlobalCustomEmojis();

    this.setupUnreadTitleUpdater();

    $("chat-view").classList.add("hidden");
    $("welcome").classList.remove("hidden");
    this.updatePageTitle();

    await this.handleDeepLink();
    await this.community.handleCommunityDeepLink();
  }

  /* ---------- Bind global events ---------- */
  bindGlobalEvents() {
    const start = () => {
      applyProfileTheme(getProfileTheme());
      applyTranslations();
      this.applyUiPrefs();

      // Auth
      $("btn-login").addEventListener("click", () => this.authService.doLogin());
      $("btn-register").addEventListener("click", () => this.authService.doRegister());
      $("btn-mfa").addEventListener("click", () => this.authService.doMfaVerify());
      $("goto-register").addEventListener("click", () => { this.sounds?.click(); this.authService.showAuthCard("register"); });
      $("goto-login").addEventListener("click", () => { this.sounds?.click(); this.authService.showAuthCard("login"); });
      $("mfa-cancel").addEventListener("click", () => { this.sounds?.click(); this.authService.showAuthCard("login"); });
      $("goto-forgot").addEventListener("click", () => alert("Восстановление через email недоступно — аккаунт использует nickname."));
      ["login-username", "login-password"].forEach((id) => {
        $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") this.authService.doLogin(); });
      });
      $("reg-password2").addEventListener("keydown", (e) => { if (e.key === "Enter") this.authService.doRegister(); });
      $("mfa-code").addEventListener("keydown", (e) => { if (e.key === "Enter") this.authService.doMfaVerify(); });

      // Tabs
      $$(".tab").forEach((t2) => t2.addEventListener("click", () => this.setTab(t2.dataset.tab)));

      // Top bar
      $("btn-settings")?.addEventListener("click", () => { this.sounds?.click(); this.openSettings(); });
      $("btn-logout")?.addEventListener("click", () => this.authService.logout());
      $("btn-settings-top")?.addEventListener("click", () => { this.sounds?.click(); this.openSettings(); });
      $("btn-logout-top")?.addEventListener("click", () => this.authService.logout());
      $("btn-accounts")?.addEventListener("click", () => { this.sounds?.click(); this.openAccountsSwitcher(); });
      $("btn-notifications")?.addEventListener("click", () => { this.sounds?.click(); this.chatService.openNotificationChat(); });
      $("btn-catalog")?.addEventListener("click", () => { this.sounds?.click(); this.settingsService.openChannelCatalog(); });
      $("btn-search-channel")?.addEventListener("click", () => {
        this.sounds?.click();
        const q = prompt("Введите @username или ссылку:");
        if (q) this.searchChannel(q.replace(/^@/, ""));
      });

      // Communities
      $("btn-communities")?.addEventListener("click", () => { this.sounds?.click(); this.community.open(); });
      $("btn-quick-community")?.addEventListener("click", () => { this.sounds?.click(); this.community.open(); });
      $("btn-communities-close")?.addEventListener("click", () => { $("communities-home").classList.add("hidden"); });
      $("btn-communities-create")?.addEventListener("click", () => { $("communities-home").classList.add("hidden"); this.community.openCreateDialog(); });
      $("btn-communities-join")?.addEventListener("click", () => { $("communities-home").classList.add("hidden"); this.community.openJoinByLinkDialog(); });
      $("btn-community-menu")?.addEventListener("click", () => this.community.openCommunityMenu());
      $("btn-community-rail-mobile")?.addEventListener("click", () => { $("community-rail").classList.toggle("open"); });
      $("btn-community-menu-mobile")?.addEventListener("click", () => { $("community-sidebar").classList.toggle("open"); });
      $("btn-community-toggle-members")?.addEventListener("click", () => {
        $("community-members-panel").classList.toggle("open");
        $("community-members-panel").classList.toggle("hidden");
      });
      const commComposer = $("community-composer");
      if (commComposer) {
        commComposer.addEventListener("input", () => {
          commComposer.style.height = "auto";
          commComposer.style.height = Math.min(commComposer.scrollHeight, 160) + "px";
        });
        commComposer.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.community.sendFromComposer();
          }
        });
      }
      $("btn-community-send")?.addEventListener("click", () => this.community.sendFromComposer());
      $("btn-community-attach")?.addEventListener("click", () => {
        const inp = $("file-community-attach");
        inp.value = "";
        inp.onchange = async () => {
          const file = inp.files[0];
          if (!file || !this.community.activeChannel) return;
          if (file.size > ATTACH_MAX) return toast("Файл больше 50 MB", "warning");
          try {
            toast("Загрузка…", "info");
            const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
            const path = `${this.user.id}/community/${this.community.activeCommunity.id}/${this.community.activeChannel.id}/${Date.now()}-${safeName}`;
            const { error: upErr } = await supabase.storage.from("attachments")
              .upload(path, file, { contentType: file.type, upsert: false });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from("attachments").getPublicUrl(path);
            let kind = "file";
            if (file.type.startsWith("image/")) kind = "image";
            else if (file.type.startsWith("video/")) kind = "video";
            const { data, error } = await supabase.from("community_messages").insert({
              channel_id: this.community.activeChannel.id,
              community_id: this.community.activeCommunity.id,
              sender_id: this.user.id,
              content: "", kind,
              attachment_url: pub.publicUrl,
              attachment_type: kind,
              file_name: file.name,
              file_size: file.size,
            }).select().single();
            if (error) throw error;
            if (!this.community.messages.find((x) => x.id === data.id)) {
              this.community.messages.push(data);
              this.community.renderMessages();
            }
            this.sounds?.send();
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        };
        inp.click();
      });

      // Me
      $("me-avatar")?.addEventListener("click", () => { this.sounds?.click(); this.profileService.openProfile(); });
      $("me-name")?.addEventListener("click", () => { this.sounds?.click(); this.profileService.openProfile(); });

      // Search
      $("search-input")?.addEventListener("input", (e) => {
        clearTimeout(this.searchTimeout);
        const q = e.target.value.trim();
        if (!q) { this.renderSidebarList(); return; }
        this.searchTimeout = setTimeout(() => this.searchUser(q), 300);
      });

      // New chat button
      $("btn-new-chat")?.addEventListener("click", () => { this.sounds?.click(); this.openNewChatDialog(); });
      $("btn-quick-group")?.addEventListener("click", () => { this.sounds?.click(); this.openNewChatDialog("group"); });
      $("btn-quick-channel")?.addEventListener("click", () => { this.sounds?.click(); this.openNewChatDialog("channel"); });
      $("btn-quick-bot")?.addEventListener("click", () => { this.sounds?.click(); this.settingsService.openBotFather(); });
      $("btn-quick-local")?.addEventListener("click", () => { this.sounds?.click(); this.settingsService.openLocalRoomsDialog(); });
      $("btn-quick-ephemeral")?.addEventListener("click", () => { this.sounds?.click(); this.settingsService.openEphemeralDialog(); });

      // Composer
      const composer = $("composer");
      if (composer) {
        composer.addEventListener("input", () => {
          composer.style.height = "auto";
          composer.style.height = Math.min(composer.scrollHeight, 160) + "px";
          this.realtimeService.broadcastTyping();
        });
        composer.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.chatService.sendCurrent();
          }
        });
      }
      $("btn-send")?.addEventListener("click", () => this.chatService.sendCurrent());
      $("btn-attach")?.addEventListener("click", () => { this.sounds?.click(); this.settingsService.pickAttachment(); });
      $("btn-emoji")?.addEventListener("click", () => { this.sounds?.click(); this.chatService.openPicker("emoji"); });
      $("btn-sticker")?.addEventListener("click", () => { this.sounds?.click(); this.chatService.openPicker("stickers"); });
      $("btn-poll")?.addEventListener("click", () => { this.sounds?.click(); this.openPollCreator(); });
      $("btn-voice")?.addEventListener("click", () => { this.sounds?.click(); this.settingsService.toggleVoiceRecording(); });
      $("attach-cancel")?.addEventListener("click", () => this.hideAttachBar());

      const vCancel = $("voice-cancel-btn");
      if (vCancel) {
        vCancel.addEventListener("click", () => {
          if (this._recorder) {
            this._recorder.onstop = null;
            try { this._recorder.stop(); } catch (_) {}
            this._recorder = null;
          }
          if (this._voiceTimer) { clearInterval(this._voiceTimer); this._voiceTimer = null; }
          $("voice-bar").classList.add("hidden");
        });
      }
      $("voice-send-btn")?.addEventListener("click", () => this.settingsService.stopVoiceRecording());

      // Chat header
      $("btn-chat-info")?.addEventListener("click", () => { this.sounds?.click(); this.openChatInfo(); });
      $("chat-header-body")?.addEventListener("click", () => { this.sounds?.click(); this.openChatInfo(); });

      // Mobile
      $("btn-mobile-menu")?.addEventListener("click", () => { $("sidebar").classList.toggle("hidden-mobile"); });
      $("sidebar")?.addEventListener("click", (e) => {
        if (window.innerWidth <= 768 && e.target.closest(".list-item")) {
          $("sidebar").classList.add("hidden-mobile");
        }
      });

      // Files
      $("file-avatar")?.addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          toast("Загрузка…", "info");
          await this.profileService.uploadAvatar(f);
          this.renderSidebarFooter();
          rememberAccount({
            id: this.user.id,
            username: this.profile.username,
            nexora_id: this.profile.nexora_id,
            avatar_url: this.profile.avatar_url,
          });
          toast("Аватар обновлён", "success");
          this.sounds?.success();
        } catch (err) { toast(err.message || "Ошибка", "error"); }
      });
      $("file-cover")?.addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          toast("Загрузка…", "info");
          await this.profileService.uploadCover(f);
          toast("Обложка обновлена", "success");
          this.sounds?.success();
        } catch (err) { toast(err.message || "Ошибка", "error"); }
      });
      $("file-badge")?.addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          toast("Загрузка…", "info");
          await this.profileService.uploadBadge(f);
          this.renderSidebarFooter();
          toast("Значок обновлён", "success");
          this.sounds?.success();
        } catch (err) { toast(err.message || "Ошибка", "error"); }
      });
      $("file-notif-sound")?.addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          toast("Загрузка…", "info");
          await this.profileService.uploadNotifSound(f);
          toast("Звук обновлён", "success");
          this.sounds?.message();
          this.closeModal();
          setTimeout(() => this.openSettings(), 100);
        } catch (err) { toast(err.message || "Ошибка", "error"); }
      });

      // SVG catalog
      $("svg-catalog-close")?.addEventListener("click", () => $("svg-catalog-modal").classList.add("hidden"));
      $("svg-catalog-modal")?.addEventListener("click", (e) => {
        if (e.target === $("svg-catalog-modal")) $("svg-catalog-modal").classList.add("hidden");
      });

      // Global
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".ctx-menu")) this.closeContextMenu();
        this.sounds?.unlock();
      });
      window.addEventListener("mousemove", (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 20;
        const y = (e.clientY / window.innerHeight - 0.5) * 20;
        document.body.style.setProperty("--parallax-x", `${x}px`);
        document.body.style.setProperty("--parallax-y", `${y}px`);
      });
      if (window.innerWidth <= 768) {
        $("sidebar")?.classList.remove("hidden-mobile");
      }

      this.boot().catch((err) => {
        console.error(err);
        toast("Ошибка запуска", "error");
        this.showScreen("screen-auth");
        this.authService.showAuthCard("login");
      });
    };

    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", start, { once: true });
    } else start();
  }

  /* ---------- Заглушки для кнопок, которые появятся позже ---------- */
  openPollCreator() { toast("Опросы — этап 3", "info"); }
  openNewChatDialog() { toast("Создание чатов — этап 3", "info"); }
  openChatInfo() {
    if (!this.activeChat) return;
    if (this.activeChat.type === "direct" && this.activeChat.peer) {
      return this.profileService.openUserProfile(this.activeChat.peer.id, this.activeChat.peer);
    }
    toast("Инфо о чате — этап 3", "info");
  }
  openAccountsSwitcher() {
    const accounts = loadAccounts();
    this.openModal({
      title: "Аккаунты",
      narrow: true,
      body: (body) => {
        body.innerHTML = "";
        if (!accounts.length) {
          body.innerHTML = `<p class="muted">Нет сохранённых аккаунтов</p>`;
        }
        accounts.forEach((a) => {
          const row = document.createElement("div");
          row.className = "account-row" + (a.id === this.user?.id ? " current" : "");
          row.innerHTML = `${avatarHTML(a, "md")}<div class="account-info"><div class="account-name">${escapeHtml(a.username)}</div><div class="account-id">${escapeHtml(a.nexora_id || "")}</div></div>${a.id === this.user?.id ? '<span class="account-badge">Активен</span>' : ""}`;
          if (a.id !== this.user?.id) {
            row.addEventListener("click", async () => {
              this.closeModal();
              await this.authService.switchAccount(a.id);
            });
            const rm = document.createElement("button");
            rm.className = "btn btn-ghost";
            rm.style.marginLeft = "6px";
            rm.textContent = "✕";
            rm.addEventListener("click", (e) => {
              e.stopPropagation();
              forgetAccount(a.id);
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
            rememberAccount({
              id: this.user.id,
              username: this.profile.username,
              nexora_id: this.profile.nexora_id,
              avatar_url: this.profile.avatar_url,
            });
          }
          this.closeModal();
          await this.authService.logout(true);
        });
        body.appendChild(add);
      },
    });
  }
}

/* ---------- Run ---------- */
const app = new NEXORA();
window.nexora = app;