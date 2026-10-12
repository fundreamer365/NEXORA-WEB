/* ============================================================
   NEXORA — js/realtime.js
   Все подписки Supabase Realtime + обработчики событий.
   Импортирует: ./supabase.js, ./util.js, ./media.js
   ============================================================ */

import { supabase, POLL_MS, TYPING_TIMEOUT_MS } from "./supabase.js";
import { $, toast } from "./util.js";

/* ============================================================
   RealtimeService — методы через NEXORA
   ============================================================ */
export class RealtimeService {
  constructor(app) {
    this.app = app;

    // Активные каналы для открытого чата
    this.realtimeChannel = null;
    this.typingChannel = null;
    this.pollsChannel = null;
    this.typingSelfTimeout = null;

    // Глобальные каналы (все чаты)
    this._chMembersChannel = null;
    this._chChatsChannel = null;
    this._chReactionsChannel = null;
    this._chEmojisChannel = null;
    this._chMessagesChannel = null;
    this._chProfilesChannel = null;

    // Таймеры для дебаунса
    this._chatsReloadTimer = null;
    this._membersReloadTimer = null;
    this._pollsReloadTimer = null;

    // Typing-хранилище
    this.app.typingUsers = this.app.typingUsers || {};
  }

  /* ============================================================
     Подписки на текущий чат
     ============================================================ */

  subscribeChat(chatId) {
    if (this.realtimeChannel) supabase.removeChannel(this.realtimeChannel);
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

  subscribeTyping(chatId) {
    if (this.typingChannel) {
      supabase.removeChannel(this.typingChannel);
      this.typingChannel = null;
    }
    this.typingChannel = supabase.channel("typing:" + chatId, {
      config: { broadcast: { self: false } },
    });
    this.typingChannel
      .on("broadcast", { event: "typing" }, (payload) => {
        const { user_id, username } = payload.payload || {};
        if (!user_id || user_id === this.app.user.id) return;
        if (!this.app.typingUsers[chatId]) this.app.typingUsers[chatId] = {};
        this.app.typingUsers[chatId][user_id] = {
          name: username || "User",
          ts: Date.now(),
        };
        this.app.renderSidebarList();

        this._typingClear = this._typingClear || {};
        clearTimeout(this._typingClear[chatId]);
        this._typingClear[chatId] = setTimeout(() => {
          delete this.app.typingUsers[chatId]?.[user_id];
          this.app.renderSidebarList();
        }, TYPING_TIMEOUT_MS);

        if (this.app.activeChat?.id === chatId) this.updateHeaderTyping();
      })
      .subscribe();
  }

  subscribePolls(chatId) {
    if (this.pollsChannel) {
      supabase.removeChannel(this.pollsChannel);
      this.pollsChannel = null;
    }
    this.pollsChannel = supabase.channel("polls:" + chatId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "poll_votes" },
        () => this.reloadPollsSafe())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "polls", filter: `chat_id=eq.${chatId}` },
        () => this.reloadPollsSafe())
      .subscribe();
  }

  async reloadPollsSafe() {
    if (!this.app.activeChat) return;
    clearTimeout(this._pollsReloadTimer);
    this._pollsReloadTimer = setTimeout(async () => {
      if (!this.app.activeChat) return;
      await this.app.chatService.loadPolls();
      this.app.chatService.paintMessageWindow();
    }, 250);
  }

  broadcastTyping() {
    if (!this.typingChannel || !this.app.activeChat) return;
    if (this.typingSelfTimeout) return;
    this.typingChannel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: this.app.user.id,
        username: this.app.profile?.username || "User",
      },
    });
    this.typingSelfTimeout = setTimeout(() => {
      this.typingSelfTimeout = null;
    }, 2000);
  }

  updateHeaderTyping() {
    const chat = this.app.activeChat;
    if (!chat) return;
    const tt = this.app.typingUsers[chat.id];
    const typers = tt
      ? Object.values(tt).filter((x) => Date.now() - x.ts < TYPING_TIMEOUT_MS)
      : [];
    const sub = $("chat-peer-sub");
    if (!sub) return;

    if (typers.length) {
      sub.textContent = typers.map((x) => x.name).join(", ") + " печатает…";
      sub.classList.add("typing");
    } else {
      const peer = chat.peer;
      if (chat.is_notification) sub.textContent = "Уведомления о входах в аккаунт";
      else if (chat.type === "channel") {
        sub.textContent = `${chat.is_public ? "публичный" : "приватный"} канал · ${chat.members_count || 0} подписчиков`;
      } else if (chat.type === "group") {
        sub.textContent = `${chat.is_public ? "публичная" : "приватная"} группа · ${chat.members_count || 0} участников`;
      } else if (chat.type === "saved") {
        sub.textContent = "Твои сохранённые сообщения";
      } else {
        sub.textContent = peer?.nexora_id
          || (chat.members_count ? `${chat.members_count} участников` : "");
      }
      sub.classList.remove("typing");
    }
  }

  stopRealtime() {
    if (this.realtimeChannel) { supabase.removeChannel(this.realtimeChannel); this.realtimeChannel = null; }
    if (this.typingChannel) { supabase.removeChannel(this.typingChannel); this.typingChannel = null; }
    if (this.pollsChannel) { supabase.removeChannel(this.pollsChannel); this.pollsChannel = null; }
    clearTimeout(this._pollsReloadTimer);
    this._pollsReloadTimer = null;
  }

  /* ============================================================
     Обработчики событий текущего чата
     ============================================================ */

  onRealtimeInsert(m) {
    if (!this.app.activeChat || m.chat_id !== this.app.activeChat.id) return;
    if (this.app.chatService.hiddenMsgs.has(m.id)) return;
    if (this.app.messages.find((x) => x.id === m.id)) return;
    if (m.sender_id === this.app.user.id) return;

    this.app.messages.push(m);
    this.app.chatService.paintMessageWindow();
    this.app.markChatRead(this.app.activeChat.id);
    this.app.sounds?.message();

    if (m.kind === "poll") this.reloadPollsSafe();
  }

  onRealtimeUpdate(m) {
    if (!this.app.activeChat || m.chat_id !== this.app.activeChat.id) return;
    const i = this.app.messages.findIndex((x) => x.id === m.id);
    if (i >= 0) {
      const wasDeleted = !!this.app.messages[i].deleted_at;
      this.app.messages[i] = m;
      if (m.deleted_at && !wasDeleted) {
        const el = document.querySelector(`[data-message-id="${m.id}"]`);
        if (el) el.classList.add("msg-removing");
        setTimeout(() => this.app.chatService.paintMessageWindow(), 220);
      } else {
        this.app.chatService.paintMessageWindow();
      }
    }
  }

  onRealtimeDelete(m) {
    if (!this.app.activeChat) return;
    const el = document.querySelector(`[data-message-id="${m.id}"]`);
    if (el) el.classList.add("msg-removing");
    this.app.messages = this.app.messages.filter((x) => x.id !== m.id);
    setTimeout(() => this.app.chatService.paintMessageWindow(), 180);
  }

  /* ============================================================
     Глобальные подписки
     ============================================================ */

  subscribeProfiles() {
    if (this._chProfilesChannel) supabase.removeChannel(this._chProfilesChannel);
    this._chProfilesChannel = supabase.channel("profiles-watch")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (p) => this.onProfileUpdate(p.new))
      .subscribe();
  }

  subscribeGlobalMessages() {
    if (this._chMessagesChannel) supabase.removeChannel(this._chMessagesChannel);
    this._chMessagesChannel = supabase.channel("global-messages")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (p) => {
          const m = p.new;
          if (!m || m.sender_id === this.app.user.id) return;
          if (this.app.activeChat && m.chat_id === this.app.activeChat.id) return;
          this.scheduleRefreshChats();
          const chat = this.app.chats.find((c) => c.id === m.chat_id);
          const title = chat?.display_title || "NEXORA";
          this.app.notify(title, m.content || "Новое сообщение");
          this.app.sounds?.message();
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        () => this.scheduleRefreshChats(500))
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        () => this.scheduleRefreshChats(500))
      .on("postgres_changes",
        { event: "*", schema: "public", table: "chat_reads" },
        () => this.app.loadReadsByOther())
      .subscribe();
  }

  subscribeGlobalChatMembers() {
    if (this._chMembersChannel) supabase.removeChannel(this._chMembersChannel);
    this._chMembersChannel = supabase.channel("global-chat-members")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "chat_members" },
        (p) => {
          this.scheduleRefreshChats(400);
          if (this.app.activeChat && p.new && p.new.chat_id === this.app.activeChat.id) {
            this.scheduleReloadMembers(300);
          }
          if (this.app.activeChat && p.old && p.old.chat_id === this.app.activeChat.id) {
            this.scheduleReloadMembers(300);
          }
        })
      .subscribe();
  }

  subscribeGlobalChats() {
    if (this._chChatsChannel) supabase.removeChannel(this._chChatsChannel);
    this._chChatsChannel = supabase.channel("global-chats")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "chats" },
        () => this.scheduleRefreshChats(400))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chats" },
        () => this.scheduleRefreshChats(400))
      .subscribe();
  }

  subscribeGlobalReactions() {
    if (this._chReactionsChannel) supabase.removeChannel(this._chReactionsChannel);
    this._chReactionsChannel = supabase.channel("global-reactions")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions" },
        (p) => {
          const r = p.new;
          if (!r) return;
          if (!this.app.messages.find((m) => m.id === r.message_id)) return;
          if (!this.app.reactions[r.message_id]) this.app.reactions[r.message_id] = {};
          if (!this.app.reactions[r.message_id][r.emoji]) {
            this.app.reactions[r.message_id][r.emoji] = [];
          }
          if (!this.app.reactions[r.message_id][r.emoji].includes(r.user_id)) {
            this.app.reactions[r.message_id][r.emoji].push(r.user_id);
          }
          this.app.chatService.paintMessageWindow();
        })
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "reactions" },
        (p) => {
          const r = p.old;
          if (!r) return;
          if (!this.app.messages.find((m) => m.id === r.message_id)) return;
          const bucket = this.app.reactions[r.message_id]?.[r.emoji];
          if (bucket) {
            const idx = bucket.indexOf(r.user_id);
            if (idx >= 0) bucket.splice(idx, 1);
            if (!bucket.length) delete this.app.reactions[r.message_id][r.emoji];
          }
          this.app.chatService.paintMessageWindow();
        })
      .subscribe();
  }

  subscribeGlobalCustomEmojis() {
    if (this._chEmojisChannel) supabase.removeChannel(this._chEmojisChannel);
    this._chEmojisChannel = supabase.channel("global-custom-emojis")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "custom_emojis" },
        () => {})
      .subscribe();
  }

  stopGlobalRealtime() {
    if (this._chMembersChannel) { supabase.removeChannel(this._chMembersChannel); this._chMembersChannel = null; }
    if (this._chChatsChannel) { supabase.removeChannel(this._chChatsChannel); this._chChatsChannel = null; }
    if (this._chReactionsChannel) { supabase.removeChannel(this._chReactionsChannel); this._chReactionsChannel = null; }
    if (this._chEmojisChannel) { supabase.removeChannel(this._chEmojisChannel); this._chEmojisChannel = null; }
    if (this._chMessagesChannel) { supabase.removeChannel(this._chMessagesChannel); this._chMessagesChannel = null; }
    if (this._chProfilesChannel) { supabase.removeChannel(this._chProfilesChannel); this._chProfilesChannel = null; }
    clearTimeout(this._chatsReloadTimer);
    clearTimeout(this._membersReloadTimer);
    this._chatsReloadTimer = null;
    this._membersReloadTimer = null;
  }

  /* ============================================================
     Дебаунс-хелперы
     ============================================================ */

  scheduleRefreshChats(delay = 300) {
    clearTimeout(this._chatsReloadTimer);
    this._chatsReloadTimer = setTimeout(() => {
      this._chatsReloadTimer = null;
      this.app.chatService.refreshChats().catch(() => {});
    }, delay);
  }

  scheduleReloadMembers(delay = 200) {
    if (!this.app.activeChat) return;
    clearTimeout(this._membersReloadTimer);
    this._membersReloadTimer = setTimeout(() => {
      this._membersReloadTimer = null;
      this.app.chatService.loadMembers().catch(() => {});
    }, delay);
  }

  /* ============================================================
     Обработчик обновления профиля
     ============================================================ */

  onProfileUpdate(p) {
    if (this.app.activePeer && this.app.activePeer.id === p.id) {
      Object.assign(this.app.activePeer, p);
      if (this.app.activeChat) {
        const ctype = this.app.activeChat.type;
        let badgeHTML = "";
        if (this.app.activeChat.is_notification) {
          badgeHTML = `<span class="list-item-badge-icon">${this.app.icons?.inbox || ""}</span>`;
        } else if (ctype === "channel") {
          badgeHTML = `<span class="list-item-badge-icon">${this.app.icons?.channel || ""}</span>`;
        } else if (ctype === "group") {
          badgeHTML = `<span class="list-item-badge-icon">${this.app.icons?.group || ""}</span>`;
        } else if (ctype === "saved") {
          badgeHTML = `<span class="list-item-badge-icon">${this.app.icons?.star || ""}</span>`;
        }
        const botTag = this.app.activePeer.is_bot ? ' <span class="bot-badge">[BOT]</span>' : "";
        const nameEl = $("chat-peer-name");
        if (nameEl) {
          nameEl.innerHTML = `${badgeHTML}${this.app.activeChat.display_title || p.username}${botTag}<span class="online-dot${this.app.isPeerOnline(this.app.activeChat) ? " online" : ""}"></span>`;
        }
      }
    }

    const c = this.app.contacts.find((cc) => cc.id === p.id);
    if (c) Object.assign(c, p);
    this.app.chats.forEach((ch) => {
      if (ch.peer?.id === p.id) Object.assign(ch.peer, p);
    });

    if (this.app.activeTab === "chats" || this.app.activeTab === "contacts") {
      this.app.renderSidebarList();
    }
  }
}