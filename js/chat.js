/* ============================================================
   NEXORA — js/chat.js
   Чаты, сообщения, реакции, опросы, отправка, редактирование,
   комментарии, каналы/группы.
   Импортирует: ./supabase.js, ./util.js, ./media.js, ./profile.js
   Экспортирует: ChatService, ContactService, BlockService
   ============================================================ */

import { supabase, ATTACH_BUCKET, STICKER_BUCKET, ATTACH_MAX, STICKER_MAX,
         QUICK_REACTIONS } from "./supabase.js";
import { $, $$, escapeHtml, safeUrl, formatTime, formatDateLabel, renderMarkdown,
         toast, humanSize, lsGet, lsSet, pushRecent,
         STATUS_META } from "./util.js";
import { AudioPlayerWidget, VideoPlayerWidget, SYSTEM_STICKERS } from "./media.js";
import { avatarHTML, buildNameHTML, paintAvatar } from "./profile.js";

/* ---------- Emoji categories ---------- */
export const EMOJI_CATEGORIES = {
  "Часто используемые": ["👍","❤️","😂","🔥","😮","😢","🙏","🎉","👀","💯","✨","🤔"],
  "Смайлы": ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😋","😜","🤪","🤔","🤨","😐","😴","😷","🤒","🥳","😎","🤓","😕","😟","😭","😱","😡","🥺","😤","🤯","🥵","🥶"],
  "Жесты": ["👋","🤚","✋","🖖","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎","✊","👊","👏","🙌","🤲","🤝","🙏","💪","🦾","🫶"],
  "Сердца": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟"],
  "Животные": ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🦄","🐝","🦋","🐢","🐙","🦑","🐳"],
  "Еда": ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🍒","🥝","🥑","🍔","🍟","🍕","🌭","🍜","🍣","🍱","🍦","🍰","🎂","🍫","🍩","☕","🍵","🍺","🍷"],
  "Объекты": ["⌚","📱","💻","⌨️","🖥️","📷","📸","🎥","📞","📺","⏰","💡","🔦","💰","💳","🔑","🔒","🔨","🧲","📎","✂️","📚","✏️","🖊"],
  "Символы": ["🔥","⭐","🌟","✨","⚡","💥","💫","💦","💨","💬","✅","❌","❗","❓","💯","🔔","🎵","🎶","♾️","🔱","☯","✡","☮","⚛"],
  "Флаги": ["🏳️","🏴","🏁","🚩","🎌","🏴‍☠️"],
};

/* ============================================================
   BlockService
   ============================================================ */
export class BlockService {
  constructor(app) { this.app = app; }

  async blockUser(userId) {
    const { error } = await supabase.rpc("block_user_secure", { p_user_id: userId });
    if (error) throw error;
  }
  async unblockUser(userId) {
    const { error } = await supabase.rpc("unblock_user_secure", { p_user_id: userId });
    if (error) throw error;
  }
  async getBlockStatus(userId) {
    try {
      const { data, error } = await supabase.rpc("get_block_status", { p_user_id: userId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row || { is_blocked_by_me: false, is_blocked_me: false };
    } catch (_) {
      return { is_blocked_by_me: false, is_blocked_me: false };
    }
  }
}

/* ============================================================
   ContactService
   ============================================================ */
export class ContactService {
  constructor(app) { this.app = app; }

  async refreshContacts() {
    try {
      const { data, error } = await supabase
        .from("contacts")
        .select("contact_id, profile:profiles!contacts_contact_id_fkey(*)")
        .eq("owner_id", this.app.user.id);
      if (error) throw error;
      let nickMap = {};
      try {
        const { data: nicks } = await supabase
          .from("contact_nicknames")
          .select("contact_id, nickname")
          .eq("owner_id", this.app.user.id);
        (nicks || []).forEach((n) => { nickMap[n.contact_id] = n.nickname; });
      } catch (_) {}
      this.app.contacts = (data || [])
        .map((r) => {
          const p = r.profile;
          if (!p) return null;
          p.nickname = nickMap[p.id] || null;
          return p;
        })
        .filter(Boolean);
    } catch (e) {
      console.error("refreshContacts:", e);
      this.app.contacts = [];
    }
    if (this.app.activeTab === "contacts") this.app.renderSidebarList();
  }

  async addContact(contactId) {
    if (contactId === this.app.user.id) throw new Error("Нельзя добавить себя");
    const { error } = await supabase
      .from("contacts")
      .insert({ owner_id: this.app.user.id, contact_id: contactId });
    if (error && error.code !== "23505") throw error;
  }
}

/* ============================================================
   ChatService
   ============================================================ */
export class ChatService {
  constructor(app) {
    this.app = app;
    // Состояние для каждого "активного" чата
    this.realtimeChannel = null;
    this.typingChannel = null;
    this.pollsChannel = null;
    this.pollTimer = null;
    this.typingSelfTimeout = null;
    this._pollsReloadTimer = null;
    this.hiddenMsgs = new Set(lsGet("nexora-hidden-msgs", []));
  }

  /* ---------- Hidden messages ---------- */
  markHidden(msgId) {
    this.hiddenMsgs.add(msgId);
    lsSet("nexora-hidden-msgs", [...this.hiddenMsgs]);
  }

  /* ---------- Refresh chat list ---------- */
  async refreshChats() {
    try {
      const { data: mem } = await supabase
        .from("chat_members")
        .select("chat_id, hidden_until")
        .eq("user_id", this.app.user.id);
      const visible = (mem || []).filter((m) => !m.hidden_until);
      const ids = visible.map((m) => m.chat_id);
      if (!ids.length) {
        this.app.chats = [];
        if (this.app.activeTab === "chats") this.app.renderSidebarList();
        this.app.updatePageTitle();
        return;
      }
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: chats }, { data: members }, { data: msgs }, { data: nicks }, { data: notifs }] =
        await Promise.all([
          supabase.from("chats")
            .select("id, is_group, title, type, avatar_url, updated_at, owner_id, username, is_public, invite_token, is_ephemeral, expires_at, description")
            .in("id", ids),
          supabase.from("chat_members")
            .select("chat_id, user_id, role, profile:profiles!chat_members_user_id_fkey(id, username, nexora_id, avatar_url, is_online, show_online, is_bot, status, badge_emoji, badge_url, badge_anim, name_color, name_title, nickname)")
            .in("chat_id", ids),
          supabase.from("messages")
            .select("chat_id, content, kind, created_at, sender_id")
            .in("chat_id", ids).gte("created_at", thirtyDaysAgo)
            .order("created_at", { ascending: false }).limit(500),
          supabase.from("contact_nicknames")
            .select("contact_id, nickname").eq("owner_id", this.app.user.id),
          supabase.from("notification_chats")
            .select("chat_id").eq("user_id", this.app.user.id),
        ]);
      const lastBy = {};
      (msgs || []).forEach((m) => { if (!lastBy[m.chat_id]) lastBy[m.chat_id] = m; });
      const nickMap = {};
      (nicks || []).forEach((n) => { nickMap[n.contact_id] = n.nickname; });
      const notifIds = new Set((notifs || []).map((n) => n.chat_id));

      this.app.chats = (chats || []).map((c) => {
        const mems = (members || []).filter((m) => m.chat_id === c.id);
        const other = mems.find((m) => m.user_id !== this.app.user.id);
        const myMem = mems.find((m) => m.user_id === this.app.user.id);
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
          title: c.title, avatar_url: c.avatar_url, owner_id: c.owner_id,
          username: c.username, is_public: c.is_public, invite_token: c.invite_token,
          is_ephemeral: c.is_ephemeral, expires_at: c.expires_at,
          description: c.description,
          updated_at: c.updated_at, my_role: myMem?.role || "member",
          peer, display_title: display, members_count: mems.length,
          is_notification: notifIds.has(c.id),
          last_message: last
            ? { content: last.content || "", kind: last.kind || "text",
                created_at: last.created_at,
                is_own: last.sender_id === this.app.user.id }
            : null,
        };
      }).sort((a, b) => {
        const rankA = a.is_notification ? 0 : a.type === "saved" ? 1 : 2;
        const rankB = b.is_notification ? 0 : b.type === "saved" ? 1 : 2;
        if (rankA !== rankB) return rankA - rankB;
        const ta = a.last_message?.created_at || a.updated_at || "";
        const tb = b.last_message?.created_at || b.updated_at || "";
        return new Date(tb) - new Date(ta);
      });

      if (this.app.activeTab === "chats") this.app.renderSidebarList();
      this.app.updatePageTitle();
    } catch (e) {
      console.error("refreshChats:", e);
      this.app.chats = [];
      if (this.app.activeTab === "chats") this.app.renderSidebarList();
    }
  }

  /* ---------- Open direct chat with peer ---------- */
  async openDirectChat(peer) {
    try {
      const bs = await this.app.blockService.getBlockStatus(peer.id);
      if (bs.is_blocked_me) {
        toast("Вы заблокированы этим пользователем. Отправка сообщений недоступна.", "warning");
        return;
      }
      const { data, error } = await supabase.rpc("get_or_create_direct_chat", { other_user: peer.id });
      if (error) throw error;
      await supabase.from("chat_members")
        .update({ hidden_until: null })
        .eq("chat_id", data).eq("user_id", this.app.user.id);
      await this.refreshChats();
      const chat = this.app.chats.find((c) => c.id === data)
        || { id: data, type: "direct", peer,
             display_title: peer.nickname || peer.username, members_count: 2 };
      this.openChat(chat);
    } catch (e) {
      console.error(e);
      toast("Не удалось открыть чат", "error");
    }
  }

  async openChatById(chatId) {
    await this.refreshChats();
    const chat = this.app.chats.find((c) => c.id === chatId);
    if (chat) this.openChat(chat);
  }

  async openSavedChat() {
    try {
      const { data, error } = await supabase.rpc("get_or_create_saved_chat");
      if (error) throw error;
      await this.refreshChats();
      let chat = this.app.chats.find((c) => c.id === data);
      if (!chat) chat = { id: data, type: "saved", display_title: "Избранное", members_count: 1, my_role: "owner" };
      this.openChat(chat);
    } catch (e) { toast("Не удалось открыть Избранное", "error"); }
  }

  async openNotificationChat() {
    try {
      const { data, error } = await supabase.rpc("get_or_create_notification_chat");
      if (error) throw error;
      this.app.notificationChatId = data;
      await this.refreshChats();
      let chat = this.app.chats.find((c) => c.id === data);
      if (!chat) chat = { id: data, type: "saved", is_notification: true, display_title: "NEXORA", members_count: 1, my_role: "owner" };
      this.openChat(chat);
    } catch (e) { toast("Не удалось открыть уведомления", "error"); }
  }

  /* ---------- Open chat (full) ---------- */
  async openChat(chat) {
    this.stopPolling();
    this.app.activeChat = chat;
    this.app.activePeer = chat.peer || null;
    this.app.pendingReplyTo = null;
    this.app.sounds?.click();
    $("welcome").classList.add("hidden");
    $("chat-view").classList.remove("hidden");

    const ctype = chat.type || "direct";
    let badgeHTML = "";
    if (chat.is_notification) badgeHTML = `<span class="list-item-badge-icon">${this.app.icons?.inbox || ""}</span>`;
    else if (ctype === "channel") badgeHTML = `<span class="list-item-badge-icon">${this.app.icons?.channel || ""}</span>`;
    else if (ctype === "group") badgeHTML = `<span class="list-item-badge-icon">${this.app.icons?.group || ""}</span>`;
    else if (ctype === "saved") badgeHTML = `<span class="list-item-badge-icon">${this.app.icons?.star || ""}</span>`;

    const botTag = chat.peer?.is_bot ? ' <span class="bot-badge">[BOT]</span>' : "";
    let title;
    if (chat.is_notification) title = "NEXORA";
    else if (ctype === "saved") title = "Избранное";
    else title = chat.peer?.nickname || chat.display_title;

    let nameHTML;
    if (ctype === "direct" && chat.peer?.id) {
      nameHTML = buildNameHTML({ ...chat.peer, username: title }, { showBadge: true });
    } else nameHTML = escapeHtml(title);

    let chanTag = "";
    if ((ctype === "channel" || ctype === "group") && chat.username) {
      chanTag = `<span class="channel-badge ${chat.is_public ? "public" : "private"}">@${escapeHtml(chat.username)}</span>`;
    }
    let ephTag = "";
    if (chat.is_ephemeral && chat.expires_at) {
      const left = Math.max(0, Math.floor((new Date(chat.expires_at) - new Date()) / 60000));
      ephTag = `<span class="ephemeral-badge">⏳ ${left} мин</span>`;
    }

    $("chat-peer-name").innerHTML = `${badgeHTML}${nameHTML}${botTag}${chanTag}${ephTag}
      <span class="online-dot${this.app.isPeerOnline(chat) ? " online" : ""}"></span>`;

    if (chat.is_notification) $("chat-peer-sub").textContent = "Уведомления о входах";
    else if (ctype === "saved") $("chat-peer-sub").textContent = "Твои сохранённые сообщения";
    else if (ctype === "channel") $("chat-peer-sub").textContent = `${chat.is_public ? "публичный" : "приватный"} канал · ${chat.members_count || 0} подписчиков`;
    else if (ctype === "group") $("chat-peer-sub").textContent = `${chat.is_public ? "публичная" : "приватная"} группа · ${chat.members_count || 0} участников`;
    else $("chat-peer-sub").textContent = chat.peer?.nexora_id || (chat.members_count ? `${chat.members_count} участников` : "");

    paintAvatar($("chat-peer-avatar"),
      chat.type === "saved" && !chat.is_notification ? { username: "★" }
      : chat.is_notification ? { username: "N" }
      : (chat.peer || { username: chat.display_title })
    );

    const blocked = ctype === "channel" && !["owner", "admin"].includes(chat.my_role);
    $("composer").disabled = blocked;
    $("btn-send").disabled = blocked;
    $("btn-attach").disabled = blocked;
    $("btn-emoji").disabled = blocked;
    $("btn-sticker").disabled = blocked;
    $("btn-poll").disabled = blocked;
    $("btn-voice").disabled = blocked;
    $("composer").placeholder = blocked ? "Писать могут только админы" : "Напиши сообщение…";

    if (window.innerWidth <= 768) $("sidebar").classList.add("hidden-mobile");

    await this.app.loadChatThemes();
    this.app.applyChatThemeToUI(chat.id);

    this.stopRealtime();
    await this.loadMembers();
    await this.loadMessages();
    await this.loadReactions();
    await this.loadPolls();

    this.app._activeBotCommands = [];
    if (chat.peer?.is_bot) {
      try {
        const { data } = await supabase.from("custom_bots")
          .select("commands").eq("bot_user_id", chat.peer.id).maybeSingle();
        if (data?.commands) this.app._activeBotCommands = data.commands;
      } catch (_) {}
    }

    this.renderMessages();
    await this.checkStrangerBanner();

    this.app.realtimeService.subscribeChat(chat.id);
    this.app.realtimeService.subscribeTyping(chat.id);
    this.app.realtimeService.subscribePolls(chat.id);
    this.startPolling(chat.id);
    this.app.markChatRead(chat.id);
    this.app.hideReplyPreview();
    this.applyHiddenFilter();
  }

  applyHiddenFilter() {
    if (!this.hiddenMsgs.size) return;
    this.app.messages = this.app.messages.filter((m) => !this.hiddenMsgs.has(m.id));
  }

  /* ---------- Load members / messages / reactions / polls ---------- */
  async loadMembers() {
    try {
      const { data, error } = await supabase.rpc("chat_members_with_profiles",
        { p_chat_id: this.app.activeChat.id });
      if (error) throw error;
      this.app.members = data || [];
    } catch (e) { console.error(e); this.app.members = []; }
  }

  async loadMessages() {
    const { data, error } = await supabase.from("messages")
      .select("id, chat_id, sender_id, content, kind, sticker_id, attachment_url, attachment_type, file_name, file_size, edited_at, created_at, reply_to, pinned, pinned_at, channel_post_id, expires_at, deleted_at, deleted_by")
      .eq("chat_id", this.app.activeChat.id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) { console.error(error); this.app.messages = []; return; }
    this.app.messages = (data || []).filter((m) => !this.hiddenMsgs.has(m.id));
  }

  async loadReactions() {
    try {
      const ids = this.app.messages.map((m) => m.id);
      if (!ids.length) { this.app.reactions = {}; return; }
      const { data, error } = await supabase.from("reactions")
        .select("message_id, user_id, emoji").in("message_id", ids);
      if (error) throw error;
      const map = {};
      (data || []).forEach((r) => {
        if (!map[r.message_id]) map[r.message_id] = {};
        if (!map[r.message_id][r.emoji]) map[r.message_id][r.emoji] = [];
        map[r.message_id][r.emoji].push(r.user_id);
      });
      this.app.reactions = map;
    } catch (e) { console.error(e); this.app.reactions = {}; }
  }

  async loadPolls() {
    try {
      const { data, error } = await supabase.from("polls")
        .select("id, chat_id, message_id, author_id, question, options, is_quiz, correct_index, is_anonymous, allows_multiple, closed")
        .eq("chat_id", this.app.activeChat.id);
      if (error) throw error;
      const map = {};
      (data || []).forEach((p) => { if (p.message_id) map[p.message_id] = { ...p, votes: {} }; });
      const pollIds = (data || []).map((p) => p.id);
      if (pollIds.length) {
        const { data: votes } = await supabase.from("poll_votes")
          .select("poll_id, user_id, option_indices").in("poll_id", pollIds);
        (votes || []).forEach((v) => {
          const poll = Object.values(map).find((p) => p.id === v.poll_id);
          if (poll) poll.votes[v.user_id] = v.option_indices || [];
        });
      }
      this.app.polls = map;
    } catch (e) { console.error("loadPolls:", e); this.app.polls = {}; }
  }

  /* ---------- Stranger banner ---------- */
  async checkStrangerBanner() {
    const bar = $("stranger-bar");
    if (!bar) return;
    bar.classList.add("hidden");
    bar.innerHTML = "";
    if (!this.app.activeChat) return;
    if (this.app.activeChat.type === "saved") return;
    if (this.app.activeChat.is_notification) return;
    if (this.app.activeChat.type !== "direct") return;
    const peer = this.app.activeChat.peer;
    if (!peer || peer.is_bot) return;
    const inContacts = this.app.contacts.some((c) => c.id === peer.id);
    if (inContacts) return;
    if (this.app.messages.length > 0) return;

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
        await this.app.contactService.addContact(peer.id);
        await this.app.refreshContacts();
        bar.classList.add("hidden");
        toast("Добавлен в контакты", "success");
        this.app.sounds?.success();
      } catch (e) { toast(e.message || "Ошибка", "error"); }
    });

    bar.querySelector("#stranger-block").addEventListener("click", async () => {
      if (!confirm(`Заблокировать @${peer.username}?`)) return;
      try {
        await this.app.blockService.blockUser(peer.id);
        bar.classList.add("hidden");
        this.app.activeChat = null;
        $("chat-view").classList.add("hidden");
        $("welcome").classList.remove("hidden");
        await this.refreshChats();
        toast("Пользователь заблокирован", "warning");
        this.app.sounds?.error();
      } catch (e) { toast(e.message || "Ошибка", "error"); }
    });
  }

  /* ---------- Send / edit / delete ---------- */
  async sendCurrent() {
    const input = $("composer");
    const text = input.value.trim();
    const att = this.app.pendingAttachment;
    const reply = this.app.pendingReplyTo;
    if (!text && !att) return;
    if (!this.app.activeChat) return;

    input.value = "";
    input.style.height = "auto";

    try {
      let payload;
      if (att) {
        payload = {
          chat_id: this.app.activeChat.id,
          sender_id: this.app.user.id,
          content: text.slice(0, 4000),
          kind: att.kind,
          attachment_url: att.url,
          attachment_type: att.kind,
          file_name: att.name,
          file_size: att.size,
          reply_to: reply?.id || null,
        };
        this.app.pendingAttachment = null;
        this.app.hideAttachBar();
      } else {
        payload = {
          chat_id: this.app.activeChat.id,
          sender_id: this.app.user.id,
          content: text,
          kind: "text",
          reply_to: reply?.id || null,
        };
      }

      const { data, error } = await supabase.from("messages").insert(payload).select().single();
      if (error) {
        if (/row-level security|policy/i.test(error.message || "")) {
          throw new Error("Нельзя отправить сообщение: между вами есть блокировка.");
        }
        throw error;
      }
      if (!this.app.messages.find((m) => m.id === data.id)) {
        this.app.messages.push(data);
        this.paintMessageWindow();
      }
      this.app.hideReplyPreview();
      this.app.scheduleRefreshChats();
      this.app.sounds?.send();
      this.app.maybeBotReply(data);
      setTimeout(() => this.checkStrangerBanner(), 200);
    } catch (e) {
      console.error(e);
      toast(e.message || "Не удалось отправить", "error");
    }
  }

  async editMessage(msg) {
    const newText = prompt("Новый текст:", msg.content);
    if (newText === null || !newText.trim()) return;
    try {
      const { data, error } = await supabase.from("messages")
        .update({ content: newText.trim(), edited_at: new Date().toISOString() })
        .eq("id", msg.id).select().single();
      if (error) throw error;
      const i = this.app.messages.findIndex((m) => m.id === msg.id);
      if (i >= 0) this.app.messages[i] = data;
      this.paintMessageWindow();
      toast("Изменено", "success");
      this.app.sounds?.click();
    } catch (e) { toast("Ошибка", "error"); }
  }

  async deleteMessageForMe(msg) {
    if (!confirm("Удалить сообщение у себя? Другие его увидят.")) return;
    this.markHidden(msg.id);
    this.app.messages = this.app.messages.filter((m) => m.id !== msg.id);
    this.paintMessageWindow();
    toast("Удалено у тебя", "success");
    this.app.sounds?.click();
  }

  async deleteMessageForEveryone(msg) {
    if (!confirm("Удалить сообщение у всех? Действие необратимо.")) return;
    try {
      const { error } = await supabase.rpc("delete_message_for_everyone", { p_message_id: msg.id });
      if (error) throw error;
      const i = this.app.messages.findIndex((m) => m.id === msg.id);
      if (i >= 0) {
        this.app.messages[i].deleted_at = new Date().toISOString();
        this.app.messages[i].deleted_by = this.app.user.id;
        this.paintMessageWindow();
      }
      toast("Удалено у всех", "success");
      this.app.sounds?.click();
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  canDeleteForEveryone() {
    const role = this.app.activeChat?.my_role;
    return role === "owner" || role === "admin";
  }

  async toggleReaction(messageId, emoji) {
    try {
      const { data: existing } = await supabase.from("reactions")
        .select("message_id")
        .eq("message_id", messageId)
        .eq("user_id", this.app.user.id)
        .eq("emoji", emoji)
        .maybeSingle();
      if (existing) {
        await supabase.from("reactions").delete()
          .eq("message_id", messageId)
          .eq("user_id", this.app.user.id)
          .eq("emoji", emoji);
      } else {
        await supabase.from("reactions").insert({
          message_id: messageId, user_id: this.app.user.id, emoji,
        });
      }
      this.app.sounds?.reaction();
      await this.loadReactions();
      this.paintMessageWindow();
    } catch (e) { console.error(e); }
  }

  async togglePin(msg) {
    try {
      const next = !msg.pinned;
      const { data, error } = await supabase.from("messages")
        .update({
          pinned: next,
          pinned_at: next ? new Date().toISOString() : null,
          pinned_by: next ? this.app.user.id : null,
        })
        .eq("id", msg.id).select().single();
      if (error) throw error;
      const i = this.app.messages.findIndex((m) => m.id === msg.id);
      if (i >= 0) this.app.messages[i] = data;
      this.paintMessageWindow();
      toast(next ? "Закреплено" : "Откреплено", "success");
      this.app.sounds?.click();
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  async saveToFavorites(msg) {
    try {
      const { error } = await supabase.from("favorites")
        .insert({ owner_id: this.app.user.id, message_id: msg.id, chat_id: this.app.activeChat.id });
      if (error && error.code !== "23505") throw error;
      toast("Сохранено в избранное", "success");
      this.app.sounds?.success();
    } catch (e) { toast("Ошибка", "error"); }
  }

  /* ---------- Rendering ---------- */
  renderMessages() {
    const box = $("messages");
    if (!box) return;
    box.innerHTML = "";
    if (!this.app.messages.length) {
      box.innerHTML = `<div class="empty-state">Нет сообщений. Напиши первое!</div>`;
      return;
    }
    this.app.visibleStart = Math.max(0, this.app.messages.length - this.app.virtualWindow);
    this.paintMessageWindow();

    box.removeEventListener("scroll", this.app._onScrollHandler || (() => {}));
    this.app._onScrollHandler = () => {
      if (box.scrollTop < 80 && this.app.visibleStart > 0) {
        this.app.visibleStart = Math.max(0, this.app.visibleStart - 40);
        const prev = box.scrollHeight;
        this.paintMessageWindow();
        requestAnimationFrame(() => {
          box.scrollTop = box.scrollHeight - prev + box.scrollTop;
        });
      }
    };
    box.addEventListener("scroll", this.app._onScrollHandler);
  }

  paintMessageWindow() {
    const box = $("messages");
    if (!box) return;
    box.innerHTML = "";
    const slice = this.app.messages.slice(this.app.visibleStart);

    if (this.app.visibleStart > 0) {
      const more = document.createElement("div");
      more.className = "date-sep";
      more.textContent = `↑ ${this.app.visibleStart} старых сообщений`;
      box.appendChild(more);
    }

    const pinned = this.app.messages.filter((m) => m.pinned && !m.deleted_at);
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
    slice.forEach((m) => {
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
    const isOwn = m.sender_id === this.app.user.id;
    const sender = this.app.members.find((x) => x.user_id === m.sender_id);
    const senderName = isOwn ? "Ты"
      : (sender?.username || this.app.activePeer?.username || "User");
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
    if (m.deleted_at) row.classList.add("deleted");

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    if (m.pinned && !m.deleted_at) bubble.classList.add("pinned");

    // custom bubble color
    if (isOwn && this.app.profile?.bubble_color) {
      const c = this.app.profile.bubble_color;
      if (c.startsWith("linear-gradient")) bubble.style.background = c;
      else if (/^#[0-9a-fA-F]{3,8}$/.test(c)) bubble.style.background = c;
    }

    if (m.deleted_at) {
      const placeholder = document.createElement("div");
      placeholder.className = "msg-deleted";
      placeholder.textContent = "Сообщение удалено";
      bubble.appendChild(placeholder);
      row.appendChild(bubble);
      return row;
    }

    if (m.reply_to) {
      const parent = this.app.messages.find((x) => x.id === m.reply_to);
      if (parent && !parent.deleted_at) {
        const rp = document.createElement("div");
        rp.className = "msg-reply";
        const parentSender = this.app.members.find((x) => x.user_id === parent.sender_id);
        const parentName = parent.sender_id === this.app.user.id
          ? "Ты" : (parentSender?.username || "User");
        rp.innerHTML = `<div class="msg-reply-name">${escapeHtml(parentName)}</div>
          <div class="msg-reply-text">${escapeHtml((parent.content || "").slice(0, 80))}</div>`;
        rp.addEventListener("click", () => {
          const el = document.querySelector(`[data-message-id="${parent.id}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        bubble.appendChild(rp);
      }
    }

    const ctype = this.app.activeChat?.type || "direct";
    if (!isOwn && ctype !== "direct" && ctype !== "saved") {
      const h = document.createElement("div");
      h.className = "msg-sender";
      h.innerHTML = buildNameHTML(sender, { showBadge: true })
        + (isBot ? ' <span class="bot-badge">[BOT]</span>' : "");
      bubble.appendChild(h);
    }

    const content = document.createElement("div");
    content.className = "msg-content";
    if (m.kind === "poll" && this.app.polls && this.app.polls[m.id]) {
      this.renderPoll(bubble, this.app.polls[m.id], m);
    } else {
      this.renderMessageContent(content, m);
      bubble.appendChild(content);
    }

    // Text effects
    if (sender?.msg_text_effect && ["glow","rainbow","shimmer"].includes(sender.msg_text_effect)) {
      content.classList.add("msg-effect-" + sender.msg_text_effect);
    }
    if (isOwn && this.app.profile?.msg_text_effect
        && ["glow","rainbow","shimmer"].includes(this.app.profile.msg_text_effect)) {
      content.classList.add("msg-effect-" + this.app.profile.msg_text_effect);
    }

    if (ctype === "channel" && !m.channel_post_id && m.kind !== "poll") {
      const commentsBtn = document.createElement("button");
      commentsBtn.className = "comments-btn";
      commentsBtn.textContent = `💬 Комментарии`;
      commentsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.app.commentService.openCommentsFor(m);
      });
      bubble.appendChild(commentsBtn);
    }

    // Reactions
    const rx = this.app.reactions[m.id] || {};
    const rxKeys = Object.keys(rx);
    if (rxKeys.length) {
      const rbox = document.createElement("div");
      rbox.className = "msg-reactions";
      rxKeys.forEach((emoji) => {
        const chip = document.createElement("div");
        chip.className = "reaction-chip" + (rx[emoji].includes(this.app.user.id) ? " mine" : "");
        chip.textContent = `${emoji} ${rx[emoji].length}`;
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          this.showReactionVoters(m.id, emoji);
        });
        rbox.appendChild(chip);
      });
      bubble.appendChild(rbox);
    }

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    let statusHTML = "";
    if (isOwn) {
      const isRead = this.app.isMessageRead(m);
      statusHTML = `<span class="msg-status${isRead ? " read" : ""}"><span class="check">${isRead ? "✓✓" : "✓"}</span></span>`;
    }
    meta.innerHTML = `${m.edited_at ? '<span class="msg-edited">(изменено)</span>' : ""}<span>${escapeHtml(formatTime(m.created_at))}</span>${statusHTML}`;
    bubble.appendChild(meta);
    row.appendChild(bubble);

    let clickTimer = null;
    row.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      if (e.target.closest(".comments-btn")) return;
      if (e.target.closest(".reaction-chip")) return;
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        this.openReactionPicker(e, m);
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
    q.innerHTML = escapeHtml(poll.question)
      + (poll.is_quiz ? ' <span class="channel-badge public">Викторина</span>' : "");
    card.appendChild(q);

    const options = Array.isArray(poll.options) ? poll.options : [];
    const myVote = poll.votes[this.app.user.id] || [];
    const totalVotes = Object.keys(poll.votes).length;
    const counts = options.map(() => 0);
    Object.values(poll.votes).forEach((arr) => {
      (arr || []).forEach((i) => { if (counts[i] != null) counts[i] += 1; });
    });

    options.forEach((opt, idx) => {
      const optEl = document.createElement("div");
      optEl.className = "poll-option";
      const isVoted = myVote.includes(idx);
      if (isVoted) optEl.classList.add("voted");
      if (poll.is_quiz && poll.correct_index === idx) optEl.classList.add("correct");
      if (poll.is_quiz && isVoted && poll.correct_index !== idx) optEl.classList.add("incorrect");
      const pct = totalVotes > 0 ? Math.round((counts[idx] / totalVotes) * 100) : 0;

      let votersHTML = "";
      if (!poll.is_anonymous) {
        const voterNames = [];
        Object.entries(poll.votes).forEach(([uid, arr]) => {
          if ((arr || []).includes(idx)) {
            const u = this.app.members.find((mm) => mm.user_id === uid);
            if (u) voterNames.push(u.nickname || u.username || "User");
            else if (uid === this.app.user.id) voterNames.push("Ты");
          }
        });
        if (voterNames.length) {
          votersHTML = `<div class="poll-voters">${escapeHtml(voterNames.slice(0, 5).join(", "))}${voterNames.length > 5 ? " +" + (voterNames.length - 5) : ""}</div>`;
        }
      }

      optEl.innerHTML = `
        <div class="poll-option-bar" style="width:${pct}%"></div>
        <div class="poll-option-text"><span><span class="poll-checkbox"></span>${escapeHtml(opt)}</span><span class="poll-option-pct">${pct}%</span></div>${votersHTML}`;

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
          poll.votes[this.app.user.id] = newVote;
          this.paintMessageWindow();
          this.app.sounds?.click();
        } catch (e) { toast(e.message || "Ошибка", "error"); }
      });
      card.appendChild(optEl);
    });

    const meta = document.createElement("div");
    meta.className = "poll-meta";
    const votesWord = totalVotes === 1 ? "голос" : (totalVotes < 5 ? "голоса" : "голосов");
    meta.textContent = `${totalVotes} ${votesWord}`
      + (poll.is_anonymous ? " · анонимный" : "")
      + (poll.allows_multiple ? " · несколько вариантов" : "")
      + (poll.closed ? " · закрыт" : "");
    card.appendChild(meta);
    bubble.appendChild(card);
  }

  renderMessageContent(el, m) {
    el.innerHTML = "";
    const kind = m.kind || "text";

    if (kind === "sticker") {
      let url = m.attachment_url;
      if (!url && m.sticker_id?.startsWith("sys-")) {
        url = SYSTEM_STICKERS.find((s) => s.id === m.sticker_id)?.url || "";
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
      const img = document.createElement("img");
      img.className = "msg-image"; img.src = m.attachment_url; img.loading = "lazy";
      img.alt = m.file_name || "image";
      img.addEventListener("click", () => this.app.openLightbox(m.attachment_url, "image"));
      el.appendChild(img);
      if ((m.content || "").trim()) {
        const c = document.createElement("div");
        c.innerHTML = renderMarkdown(m.content);
        el.appendChild(c);
      }
      return;
    }

    if (kind === "video" && m.attachment_url) {
      const vp = new VideoPlayerWidget(m.attachment_url, {
        fileName: m.file_name, fileSize: m.file_size,
      });
      el.appendChild(vp.render());
      if ((m.content || "").trim()) {
        const c = document.createElement("div");
        c.innerHTML = renderMarkdown(m.content);
        el.appendChild(c);
      }
      return;
    }

    if (kind === "voice" && m.attachment_url) {
      const ap = new AudioPlayerWidget(m.attachment_url, {
        fileName: "", fileSize: m.file_size, compact: true,
      });
      el.appendChild(ap.render());
      return;
    }

    if (kind === "file" && m.attachment_url) {
      const isAudio = (m.attachment_type || "").startsWith("audio/")
        || /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(m.file_name || "");
      if (isAudio) {
        const ap = new AudioPlayerWidget(m.attachment_url, {
          fileName: m.file_name, fileSize: m.file_size, compact: false,
        });
        el.appendChild(ap.render());
        if ((m.content || "").trim()) {
          const c = document.createElement("div");
          c.innerHTML = renderMarkdown(m.content);
          el.appendChild(c);
        }
        return;
      }
      const a = document.createElement("a");
      a.className = "msg-file";
      a.href = m.attachment_url;
      a.target = "_blank"; a.rel = "noopener noreferrer";
      a.download = m.file_name || "";
      a.innerHTML = `<div class="msg-file-icon">${fileIcon(m.file_name)}</div><div><div class="msg-file-name">${escapeHtml(m.file_name || "Файл")}</div><div class="msg-file-size">${escapeHtml(humanSize(m.file_size))}</div></div>`;
      el.appendChild(a);
      if ((m.content || "").trim()) {
        const c = document.createElement("div");
        c.innerHTML = renderMarkdown(m.content);
        el.appendChild(c);
      }
      return;
    }

    el.innerHTML = renderMarkdown(m.content || "");
    this.replaceCustomEmojis(el);
  }

  async replaceCustomEmojis(el) {
    const html = el.innerHTML;
    const matches = [...html.matchAll(/:([a-zA-Z0-9_]{2,32}):/g)];
    if (!matches.length) return;
    const codes = [...new Set(matches.map((m) => m[1]))];
    try {
      const { data } = await supabase.from("custom_emojis")
        .select("shortcode, url").in("shortcode", codes).limit(50);
      if (!data || !data.length) return;
      let newHtml = html;
      data.forEach((e) => {
        const re = new RegExp(`:${e.shortcode}:`, "g");
        newHtml = newHtml.replace(re,
          `<img class="custom-emoji" src="${safeUrl(e.url)}" alt=":${e.shortcode}:">`);
      });
      el.innerHTML = newHtml;
    } catch (_) {}
  }

  /* ---------- Context menu ---------- */
  openMessageContextMenu(event, msg, isOwn) {
    this.app.closeContextMenu();
    if (msg.deleted_at) return;

    const menu = document.createElement("div");
    menu.className = "ctx-menu"; menu.id = "ctx-menu";

    const rxRow = document.createElement("div");
    rxRow.className = "reactions-row";
    QUICK_REACTIONS.forEach((e) => {
      const b = document.createElement("button");
      b.textContent = e;
      b.addEventListener("click", () => {
        this.app.closeContextMenu();
        this.toggleReaction(msg.id, e);
      });
      rxRow.appendChild(b);
    });
    const more = document.createElement("button");
    more.textContent = "＋";
    more.title = "Больше реакций";
    more.addEventListener("click", (ev) => {
      this.app.closeContextMenu();
      this.openReactionPicker(ev, msg);
    });
    rxRow.appendChild(more);
    menu.appendChild(rxRow);

    const mk = (label, handler, danger = false) => {
      const b = document.createElement("button");
      b.textContent = label;
      if (danger) b.classList.add("danger");
      b.addEventListener("click", () => {
        this.app.closeContextMenu();
        handler();
      });
      menu.appendChild(b);
    };

    mk(`↩ Ответить`, () => this.app.setReplyTo(msg));
    if (isOwn && (msg.kind || "text") === "text") mk(`✎ Изменить`, () => this.editMessage(msg));
    mk(`📋 Копировать`, () => {
      navigator.clipboard.writeText(msg.content || msg.attachment_url || "");
      toast("Скопировано", "success");
      this.app.sounds?.click();
    });
    mk("🔗 Ссылка", () => this.copyMessageLink(msg));
    mk("↪ Переслать", () => this.forwardMessage(msg));
    if (this.app.activeChat?.type !== "saved" && !this.app.activeChat?.is_notification) {
      mk("⭐ В избранное", () => this.saveToFavorites(msg));
    }
    mk(msg.pinned ? "📌 Открепить" : "📌 Закрепить", () => this.togglePin(msg));
    mk("🗑 Удалить у себя", () => this.deleteMessageForMe(msg), true);
    if (isOwn || this.canDeleteForEveryone()) {
      mk("🗑 Удалить у всех", () => this.deleteMessageForEveryone(msg), true);
    }

    document.body.appendChild(menu);
    const r = event.target.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = Math.min(r.right - mw, window.innerWidth - mw - 10);
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight) top = r.top - mh - 6;
    if (left < 10) left = 10;
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    setTimeout(() => document.addEventListener("click", this.app.closeContextMenu, { once: true }), 0);
  }

  /* ---------- Reaction picker ---------- */
  openReactionPicker(event, msg) {
    this.app.closeContextMenu();
    const wrap = document.createElement("div");
    wrap.className = "reaction-picker";
    wrap.id = "ctx-menu";
    const recent = lsGet("nexora-recent-reactions", []);

    const renderBody = (filter = "") => {
      const body = wrap.querySelector(".rp-body");
      body.innerHTML = "";
      const f = filter.trim().toLowerCase();
      Object.entries(EMOJI_CATEGORIES).forEach(([cat, list]) => {
        const items = f ? list.filter((e) => e.includes(f)) : list;
        if (!items.length) return;
        const title = document.createElement("div");
        title.className = "rp-title";
        title.textContent = cat;
        body.appendChild(title);
        const grid = document.createElement("div");
        grid.className = "rp-grid";
        items.forEach((e) => {
          const b = document.createElement("button");
          b.className = "rp-emoji"; b.textContent = e;
          b.addEventListener("click", () => {
            pushRecent("nexora-recent-reactions", e);
            this.toggleReaction(msg.id, e);
            this.app.closeContextMenu();
          });
          grid.appendChild(b);
        });
        body.appendChild(grid);
      });
    };

    wrap.innerHTML = `<div class="rp-search"><input placeholder="Поиск реакции…"></div><div class="rp-recent"></div><div class="rp-body"></div>`;
    if (recent.length) {
      const rc = wrap.querySelector(".rp-recent");
      rc.innerHTML = `<div class="rp-title">Недавние</div>`;
      const grid = document.createElement("div");
      grid.className = "rp-grid";
      recent.slice(0, 12).forEach((e) => {
        const b = document.createElement("button");
        b.className = "rp-emoji"; b.textContent = e;
        b.addEventListener("click", () => {
          pushRecent("nexora-recent-reactions", e);
          this.toggleReaction(msg.id, e);
          this.app.closeContextMenu();
        });
        grid.appendChild(b);
      });
      rc.appendChild(grid);
    }
    renderBody();
    const inp = wrap.querySelector("input");
    inp.addEventListener("input", () => {
      wrap.querySelector(".rp-recent").innerHTML = "";
      renderBody(inp.value);
    });
    document.body.appendChild(wrap);
    const r = event.target.getBoundingClientRect();
    wrap.style.left = Math.min(r.left, window.innerWidth - 340) + "px";
    wrap.style.top = Math.max(10, Math.min(r.top - 40, window.innerHeight - 400)) + "px";
    setTimeout(() => {
      document.addEventListener("click", (ev) => {
        if (!wrap.contains(ev.target)) this.app.closeContextMenu();
      }, { once: true });
    }, 0);
  }

  showReactionVoters(messageId, emoji) {
    const uids = this.app.reactions[messageId]?.[emoji] || [];
    if (!uids.length) return;
    this.app.openModal({
      title: `Реакция ${emoji}`,
      narrow: true,
      body: (body) => {
        const list = document.createElement("div");
        list.className = "voters-list";
        uids.forEach((uid) => {
          const u = this.app.members.find((mm) => mm.user_id === uid)
            || (uid === this.app.user.id ? this.app.profile : null);
          const name = uid === this.app.user.id
            ? (this.app.profile?.username || "Ты")
            : (u?.username || "User");
          const row = document.createElement("div");
          row.className = "voter-row";
          row.innerHTML = `${avatarHTML(u || { username: name }, "sm")}<span class="voter-name">${escapeHtml(name)}</span>`;
          list.appendChild(row);
        });
        body.appendChild(list);
      },
    });
  }

  /* ---------- Picker (emoji/stickers) ---------- */
  openPicker(initialTab = "emoji") {
    const existing = $("picker");
    if (existing) { existing.remove(); return; }
    const picker = document.createElement("div");
    picker.id = "picker";
    picker.className = "picker";
    picker.innerHTML = `<div class="picker-tabs"></div><div class="picker-search"><input placeholder="Поиск…"></div><div class="picker-body"></div>`;
    document.querySelector(".chat-view")?.appendChild(picker);

    const tabs = picker.querySelector(".picker-tabs");
    const searchWrap = picker.querySelector(".picker-search");
    const searchInp = searchWrap.querySelector("input");
    const body = picker.querySelector(".picker-body");

    const renderEmojiCat = (cat, filter = "") => {
      body.className = "picker-body";
      body.innerHTML = "";
      const f = filter.trim().toLowerCase();
      const catsToShow = cat === "*" ? Object.keys(EMOJI_CATEGORIES) : [cat];
      catsToShow.forEach((cName) => {
        let items = EMOJI_CATEGORIES[cName] || [];
        if (f) items = items.filter((e) => e.includes(f));
        if (!items.length) return;
        const title = document.createElement("div");
        title.className = "rp-title"; title.textContent = cName;
        body.appendChild(title);
        const grid = document.createElement("div");
        grid.className = "rp-grid";
        items.forEach((e) => {
          const b = document.createElement("button");
          b.className = "rp-emoji"; b.textContent = e;
          b.addEventListener("click", () => {
            this.insertAtCursor($("composer"), e);
            pushRecent("nexora-recent-emoji", e);
          });
          grid.appendChild(b);
        });
        body.appendChild(grid);
      });
      if (!body.children.length) {
        body.innerHTML = `<div class="empty-state">Ничего не найдено</div>`;
      }
    };

    const renderRecent = (filter = "") => {
      const recent = lsGet("nexora-recent-emoji", []);
      body.className = "picker-body";
      body.innerHTML = "";
      const items = filter ? recent.filter((e) => e.includes(filter)) : recent;
      if (!items.length) {
        body.innerHTML = `<div class="empty-state">Пока ничего нет</div>`;
        return;
      }
      const grid = document.createElement("div");
      grid.className = "rp-grid";
      items.forEach((e) => {
        const b = document.createElement("button");
        b.className = "rp-emoji"; b.textContent = e;
        b.addEventListener("click", () => {
          this.insertAtCursor($("composer"), e);
          pushRecent("nexora-recent-emoji", e);
        });
        grid.appendChild(b);
      });
      body.appendChild(grid);
    };

    const renderStickers = async () => {
      body.className = "picker-body stickers";
      body.innerHTML = "";
      SYSTEM_STICKERS.forEach((s) => {
        const tt = document.createElement("div");
        tt.className = "picker-sticker";
        const img = document.createElement("img");
        img.src = s.url; img.alt = s.name;
        tt.appendChild(img);
        tt.addEventListener("click", () => {
          picker.remove();
          this.sendSticker(s.id, s.url);
        });
        body.appendChild(tt);
      });
      try {
        const { data: custom } = await supabase.from("stickers")
          .select("id, name, url").order("created_at", { ascending: false });
        (custom || []).forEach((s) => {
          const tt = document.createElement("div");
          tt.className = "picker-sticker";
          const img = document.createElement("img");
          img.src = s.url; img.alt = s.name;
          tt.appendChild(img);
          tt.addEventListener("click", () => {
            picker.remove();
            this.sendSticker(s.id, s.url);
          });
          body.appendChild(tt);
        });
      } catch (_) {}
    };

    const addTab = (label, onClick) => {
      const b = document.createElement("button");
      b.className = "picker-tab"; b.textContent = label;
      b.addEventListener("click", () => {
        tabs.querySelectorAll(".picker-tab").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        searchInp.value = "";
        onClick();
      });
      tabs.appendChild(b);
      return b;
    };

    addTab("⏱", () => { searchWrap.style.display = ""; renderRecent(); });
    Object.keys(EMOJI_CATEGORIES).forEach((cat, idx) => {
      const tt = addTab(cat, () => { searchWrap.style.display = ""; renderEmojiCat(cat); });
      if (idx === 0) tt.classList.add("active");
    });
    addTab("🎨 Стикеры", () => { searchWrap.style.display = "none"; renderStickers(); });
    addTab("🔍", () => { searchWrap.style.display = ""; renderEmojiCat("*"); });

    if (initialTab === "stickers") {
      const sTab = [...tabs.children].find((c) => c.textContent.includes("Стикеры"));
      if (sTab) sTab.click();
    } else {
      renderEmojiCat(Object.keys(EMOJI_CATEGORIES)[0]);
    }

    searchInp.addEventListener("input", () => {
      const activeLabel = tabs.querySelector(".picker-tab.active")?.textContent || "";
      if (activeLabel === "⏱") renderRecent(searchInp.value);
      else if (activeLabel === "🎨 Стикеры") return;
      else renderEmojiCat("*", searchInp.value);
    });

    setTimeout(() => {
      document.addEventListener("click", (ev) => {
        const p = $("picker");
        if (p && !p.contains(ev.target)
            && !ev.target.closest("#btn-emoji")
            && !ev.target.closest("#btn-sticker")) {
          p.remove();
        }
      }, { once: true });
    }, 0);
  }

  insertAtCursor(input, text) {
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.selectionStart = input.selectionEnd = pos;
    input.focus();
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }

  async sendSticker(stickerId, stickerUrl) {
    if (!this.app.activeChat) return;
    try {
      const payload = {
        chat_id: this.app.activeChat.id,
        sender_id: this.app.user.id,
        content: "", kind: "sticker",
        sticker_id: stickerId,
        reply_to: this.app.pendingReplyTo?.id || null,
      };
      if (!stickerId.startsWith("sys-")) payload.attachment_url = stickerUrl;
      const { data, error } = await supabase.from("messages").insert(payload).select().single();
      if (error) throw error;
      if (!this.app.messages.find((m) => m.id === data.id)) {
        this.app.messages.push(data);
        this.paintMessageWindow();
      }
      this.app.hideReplyPreview();
      this.app.scheduleRefreshChats();
      this.app.sounds?.send();
    } catch (e) { toast("Ошибка стикера", "error"); }
  }

  /* ---------- Reply / forward / link ---------- */
  async copyMessageLink(msg) {
    try {
      const url = `${location.origin}${location.pathname}?chat=${this.app.activeChat.id}&msg=${msg.id}`;
      await navigator.clipboard.writeText(url);
      toast("Ссылка на сообщение скопирована", "success");
      this.app.sounds?.success();
    } catch (e) { toast("Не удалось скопировать", "error"); }
  }

  forwardMessage(msg) {
    const sorted = [...this.app.chats].sort((a, b) => {
      const aS = a.is_notification ? 1 : a.type === "saved" ? 0 : 2;
      const bS = b.is_notification ? 1 : b.type === "saved" ? 0 : 2;
      return aS - bS;
    });
    this.app.openModal({
      title: "Переслать в…",
      narrow: true,
      body: (body) => {
        if (!sorted.length) {
          body.innerHTML = `<p class="muted">У тебя пока нет чатов</p>`;
          return;
        }
        sorted.forEach((c) => {
          const row = document.createElement("div");
          row.className = "settings-row";
          row.style.cursor = "pointer";
          const label = c.is_notification ? "NEXORA"
            : c.type === "saved" ? "Избранное"
            : c.display_title;
          const desc = c.is_notification ? "уведомления"
            : c.type === "saved" ? "сохранённые сообщения"
            : c.type;
          row.innerHTML = `<div class="settings-row-info"><div class="settings-row-label">${escapeHtml(label)}</div><div class="settings-row-desc">${escapeHtml(desc)}</div></div><button class="btn btn-primary">→</button>`;
          row.querySelector("button").addEventListener("click", async () => {
            try {
              await supabase.from("messages").insert({
                chat_id: c.id,
                sender_id: this.app.user.id,
                content: msg.content || "",
                kind: msg.kind || "text",
                attachment_url: msg.attachment_url,
                attachment_type: msg.attachment_type,
                file_name: msg.file_name,
                file_size: msg.file_size,
                sticker_id: msg.sticker_id,
              });
              toast("Переслано", "success");
              this.app.sounds?.send();
              this.app.closeModal();
            } catch (e) { toast(e.message || "Ошибка", "error"); }
          });
          body.appendChild(row);
        });
      },
    });
  }

  /* ---------- Polling ---------- */
  startPolling(chatId) {
    this.stopPolling();
    let lastIso = this.app.messages.length
      ? this.app.messages[this.app.messages.length - 1].created_at
      : new Date().toISOString();
    this.pollTimer = setInterval(async () => {
      if (!this.app.activeChat || this.app.activeChat.id !== chatId) return;
      try {
        const { data } = await supabase.from("messages").select("*")
          .eq("chat_id", chatId).gt("created_at", lastIso)
          .order("created_at", { ascending: true });
        if (data && data.length) {
          data.forEach((m) => {
            if (!this.app.messages.find((x) => x.id === m.id)
                && !this.hiddenMsgs.has(m.id)) {
              this.app.messages.push(m);
            }
          });
          lastIso = data[data.length - 1].created_at;
          this.paintMessageWindow();
        }
      } catch (_) {}
    }, 20000);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  stopRealtime() {
    if (this.realtimeChannel) { supabase.removeChannel(this.realtimeChannel); this.realtimeChannel = null; }
    if (this.typingChannel) { supabase.removeChannel(this.typingChannel); this.typingChannel = null; }
    if (this.pollsChannel) { supabase.removeChannel(this.pollsChannel); this.pollsChannel = null; }
    clearTimeout(this._pollsReloadTimer);
    this._pollsReloadTimer = null;
  }
}

/* ---------- File icon helper ---------- */
function fileIcon(name) {
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