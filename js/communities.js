/* ============================================================
   NEXORA — js/communities.js
   CommunityManager — сообщества, каналы, роли, участники.
   Импортирует: ./supabase.js, ./util.js, ./profile.js
   ============================================================ */

import { supabase, ATTACH_BUCKET, ATTACH_MAX } from "./supabase.js";
import { $, escapeHtml, safeUrl, toast, formatTime, formatDateLabel,
         renderMarkdown, humanSize, STATUS_META } from "./util.js";
import { avatarHTML, paintAvatar, buildNameHTML } from "./profile.js";
import { VideoPlayerWidget } from "./media.js";

/* ---------- Разрешения ---------- */
export const COMMUNITY_PERMS = {
  manage_community: { label: "Управление сообществом", desc: "Название, описание, аватар, баннер" },
  manage_channels:  { label: "Управление каналами",    desc: "Создание, удаление, переименование" },
  manage_roles:     { label: "Управление ролями",      desc: "Создание и изменение ролей" },
  manage_members:   { label: "Управление участниками", desc: "Кик, назначение ролей" },
  create_invites:   { label: "Создание приглашений",   desc: "Invite-ссылки в сообщество" },
  send_messages:    { label: "Отправка сообщений",     desc: "Писать в текстовые каналы" },
  delete_messages:  { label: "Удаление сообщений",     desc: "Удалять чужие сообщения" },
  connect_voice:    { label: "Голосовые каналы",       desc: "Заходить в голосовые" },
};

/* ---------- Иконки (hash / volume) ---------- */
const ICON_HASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';
const ICON_VOLUME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';

/* ============================================================
   CommunityManager
   ============================================================ */
export class CommunityManager {
  constructor(app) {
    this.app = app;
    this.communities = [];
    this.activeCommunity = null;
    this.activeChannel = null;
    this.channels = [];
    this.categories = [];
    this.members = [];
    this.roles = [];
    this.memberRoles = {};
    this.messages = [];
    this.permissions = {};

    this._channelSub = null;
    this._msgSub = null;
    this._channelsSub = null;
    this._membersSub = null;
    this._rolesSub = null;
  }

  /* ---------- Open / close ---------- */
  async open() {
    $("community-screen").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    await this.loadCommunities();
    if (this.communities.length) {
      await this.selectCommunity(this.communities[0].id);
    } else {
      this.showEmptyState();
    }
  }

  close() {
    $("community-screen").classList.add("hidden");
    document.body.style.overflow = "";
    this.unsubscribeAll();
  }

  async loadCommunities() {
    try {
      const { data: mem } = await supabase
        .from("community_members")
        .select("community_id")
        .eq("user_id", this.app.user.id);
      const ids = (mem || []).map((m) => m.community_id);
      if (!ids.length) { this.communities = []; return; }

      const { data } = await supabase
        .from("communities")
        .select("id, name, description, avatar_url, banner_url, owner_id, is_public, invite_token, created_at")
        .in("id", ids)
        .order("created_at", { ascending: true });
      this.communities = data || [];
    } catch (e) {
      console.error("loadCommunities:", e);
      this.communities = [];
    }
  }

  /* ---------- Rail ---------- */
  renderRail() {
    const rail = $("community-rail");
    if (!rail) return;
    rail.innerHTML = "";
    this.communities.forEach((c) => {
      const b = document.createElement("button");
      b.className = "community-rail-btn" + (this.activeCommunity?.id === c.id ? " active" : "");
      b.title = c.name;
      if (c.avatar_url) {
        const safe = safeUrl(c.avatar_url);
        b.innerHTML = safe
          ? `<img src="${safe}" alt="">`
          : escapeHtml((c.name || "?").slice(0, 2).toUpperCase());
      } else {
        b.textContent = (c.name || "?").slice(0, 2).toUpperCase();
      }
      b.addEventListener("click", () => this.selectCommunity(c.id));
      rail.appendChild(b);
    });

    const plus = document.createElement("button");
    plus.className = "community-rail-btn plus";
    plus.title = "Создать сообщество";
    plus.textContent = "＋";
    plus.addEventListener("click", () => this.openCreateDialog());
    rail.appendChild(plus);
  }

  showEmptyState() {
    this.renderRail();
    const nameEl = $("community-sidebar-name");
    const bodyEl = $("community-sidebar-body");
    if (nameEl) nameEl.textContent = "—";
    if (bodyEl) bodyEl.innerHTML = `<div class="empty-state">Нет сообществ. Создай первое через «＋» слева.</div>`;
    $("community-empty")?.classList.remove("hidden");
    $("community-channel-view")?.classList.add("hidden");
    const listEl = $("community-members-list");
    if (listEl) listEl.innerHTML = "";
    const meNameEl = $("community-me-name");
    const meStatusEl = $("community-me-status");
    if (meNameEl) meNameEl.textContent = this.app.profile.username;
    if (meStatusEl) {
      meStatusEl.textContent = STATUS_META[this.app.profile.status || "online"]?.label || "В сети";
    }
    paintAvatar($("community-me-avatar"), this.app.profile);
  }

  /* ---------- Select community ---------- */
  async selectCommunity(id) {
    const c = this.communities.find((x) => x.id === id);
    if (!c) return;
    this.activeCommunity = c;
    this.activeChannel = null;
    this.renderRail();

    const nameEl = $("community-sidebar-name");
    if (nameEl) nameEl.textContent = c.name;

    await Promise.all([
      this.loadCategoriesAndChannels(),
      this.loadMembers(),
      this.loadRoles(),
      this.loadMyPermissions(),
    ]);

    this.renderSidebar();
    this.renderMembers();
    this.renderEmptyOrFirstChannel();
    this.subscribeCommunity();
  }

  async loadCategoriesAndChannels() {
    const cid = this.activeCommunity.id;
    const [{ data: cats }, { data: chans }] = await Promise.all([
      supabase.from("community_categories").select("*").eq("community_id", cid).order("position", { ascending: true }),
      supabase.from("community_channels").select("*").eq("community_id", cid).order("position", { ascending: true }),
    ]);
    this.categories = cats || [];
    this.channels = chans || [];
  }

  async loadRoles() {
    const { data } = await supabase
      .from("community_roles")
      .select("*")
      .eq("community_id", this.activeCommunity.id)
      .order("position", { ascending: false });
    this.roles = data || [];
  }

  async loadMembers() {
    const { data } = await supabase
      .from("community_members")
      .select("user_id, joined_at, profile:profiles!community_members_user_id_fkey(id, username, nexora_id, avatar_url, is_online, show_online, is_bot, status, badge_emoji, badge_url, badge_anim, name_color, name_title, nickname)")
      .eq("community_id", this.activeCommunity.id);
    this.members = (data || []).map((m) => ({
      user_id: m.user_id,
      joined_at: m.joined_at,
      profile: m.profile,
    }));

    const { data: mr } = await supabase
      .from("community_member_roles")
      .select("user_id, role_id")
      .eq("community_id", this.activeCommunity.id);
    const map = {};
    (mr || []).forEach((r) => {
      if (!map[r.user_id]) map[r.user_id] = [];
      map[r.user_id].push(r.role_id);
    });
    this.memberRoles = map;
  }

  async loadMyPermissions() {
    const isOwner = this.activeCommunity.owner_id === this.app.user.id;
    if (isOwner) {
      this.permissions = Object.fromEntries(Object.keys(COMMUNITY_PERMS).map((k) => [k, true]));
      return;
    }
    const myRoleIds = this.memberRoles[this.app.user.id] || [];
    const perms = {};
    myRoleIds.forEach((rid) => {
      const role = this.roles.find((r) => r.id === rid);
      if (!role) return;
      Object.entries(role.permissions || {}).forEach(([k, v]) => {
        if (v === true) perms[k] = true;
      });
    });
    this.permissions = perms;
  }

  hasPerm(p) {
    if (!this.activeCommunity) return false;
    if (this.activeCommunity.owner_id === this.app.user.id) return true;
    return this.permissions[p] === true;
  }

  /* ---------- Sidebar (channels) ---------- */
  renderSidebar() {
    const body = $("community-sidebar-body");
    if (!body) return;
    body.innerHTML = "";
    const canManage = this.hasPerm("manage_channels");
    const frag = document.createDocumentFragment();

    const orphans = this.channels.filter((c) => !c.category_id);
    orphans.forEach((ch) => frag.appendChild(this.channelItem(ch)));

    this.categories.forEach((cat) => {
      const catEl = document.createElement("div");
      catEl.className = "community-category";
      catEl.innerHTML = `<span>${escapeHtml(cat.name)}</span>`;
      if (canManage) {
        const add = document.createElement("button");
        add.className = "community-category-add";
        add.textContent = "＋";
        add.title = "Создать канал";
        add.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openCreateChannelDialog(cat.id);
        });
        catEl.appendChild(add);
      }
      frag.appendChild(catEl);
      const inCat = this.channels.filter((c) => c.category_id === cat.id);
      inCat.forEach((ch) => frag.appendChild(this.channelItem(ch)));
    });

    if (canManage) {
      const actions = document.createElement("div");
      actions.style.cssText = "padding:10px 12px;display:flex;gap:6px";

      const btnChannel = document.createElement("button");
      btnChannel.className = "btn btn-ghost";
      btnChannel.style.cssText = "flex:1;padding:6px 8px;font-size:11px";
      btnChannel.textContent = "＋ Канал";
      btnChannel.addEventListener("click", () => this.openCreateChannelDialog(null));

      const btnCat = document.createElement("button");
      btnCat.className = "btn btn-ghost";
      btnCat.style.cssText = "flex:1;padding:6px 8px;font-size:11px";
      btnCat.textContent = "＋ Категория";
      btnCat.addEventListener("click", () => this.openCreateCategoryDialog());

      actions.appendChild(btnChannel);
      actions.appendChild(btnCat);
      frag.appendChild(actions);
    }

    body.appendChild(frag);
  }

  channelItem(ch) {
    const item = document.createElement("div");
    item.className = "community-channel-item"
      + (ch.type === "voice" ? " voice" : "")
      + (this.activeChannel?.id === ch.id ? " active" : "");
    const icon = ch.type === "voice" ? ICON_VOLUME : ICON_HASH;
    item.innerHTML = `<span class="ch-icon">${icon}</span><span class="ch-name">${escapeHtml(ch.name)}</span>`;
    item.addEventListener("click", () => this.openChannel(ch));
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.openChannelContextMenu(e, ch);
    });
    return item;
  }

  renderEmptyOrFirstChannel() {
    if (this.channels.length) {
      const firstText = this.channels.find((c) => c.type === "text");
      if (firstText) this.openChannel(firstText);
      else this.openChannel(this.channels[0]);
    } else {
      $("community-empty")?.classList.remove("hidden");
      $("community-channel-view")?.classList.add("hidden");
    }
  }

  async openChannel(ch) {
    this.activeChannel = ch;
    this.renderSidebar();

    if (ch.type === "voice") {
      $("community-empty")?.classList.add("hidden");
      $("community-channel-view")?.classList.remove("hidden");
      $("community-text-view")?.classList.add("hidden");
      $("community-voice-view")?.classList.remove("hidden");
      const titleEl = $("community-channel-title");
      const topicEl = $("community-channel-topic");
      if (titleEl) titleEl.textContent = ch.name;
      if (topicEl) topicEl.textContent = ch.topic || "";
      this.renderVoiceStage();
      return;
    }

    $("community-empty")?.classList.add("hidden");
    $("community-channel-view")?.classList.remove("hidden");
    $("community-voice-view")?.classList.add("hidden");
    $("community-text-view")?.classList.remove("hidden");
    const titleEl = $("community-channel-title");
    const topicEl = $("community-channel-topic");
    if (titleEl) titleEl.textContent = ch.name;
    if (topicEl) topicEl.textContent = ch.topic || "";

    const canSend = this.hasPerm("send_messages");
    const ta = $("community-composer");
    const btnSend = $("btn-community-send");
    if (ta) {
      ta.disabled = !canSend;
      ta.placeholder = canSend
        ? `Написать в #${ch.name}…`
        : "Писать могут только участники с правом send_messages";
    }
    if (btnSend) btnSend.disabled = !canSend;

    await this.loadMessages();
    this.renderMessages();
    this.subscribeChannel(ch.id);
  }

  renderVoiceStage() {
    const stage = $("voice-stage-participants");
    if (!stage) return;
    stage.innerHTML = "";
    const participant = document.createElement("div");
    participant.className = "voice-stage-participant speaking";
    const p = this.app.profile;
    participant.innerHTML = `
      ${avatarHTML(p, "lg")}
      <div class="vp-name">${escapeHtml(p.username)}</div>
      <div class="vp-mute-badge">🎤</div>
    `;
    stage.appendChild(participant);
    toast("Голосовые каналы в разработке. UI подготовлен.", "info");
  }

  async loadMessages() {
    if (!this.activeChannel) return;
    const { data } = await supabase
      .from("community_messages")
      .select("id, channel_id, community_id, sender_id, content, kind, attachment_url, attachment_type, file_name, file_size, reply_to, edited_at, created_at, deleted_at, deleted_by")
      .eq("channel_id", this.activeChannel.id)
      .order("created_at", { ascending: true })
      .limit(300);
    this.messages = data || [];
  }

  renderMessages() {
    const box = $("community-messages");
    if (!box) return;
    box.innerHTML = "";
    if (!this.messages.length) {
      box.innerHTML = `<div class="empty-state">Пусто. Напиши первое сообщение!</div>`;
      return;
    }
    let prev = null;
    this.messages.forEach((m) => {
      const needDate = !prev
        || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
      if (needDate) {
        const sep = document.createElement("div");
        sep.className = "date-sep";
        sep.textContent = formatDateLabel(m.created_at);
        box.appendChild(sep);
      }
      box.appendChild(this.renderOne(m));
      prev = m;
    });
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }

  renderOne(m) {
    const isOwn = m.sender_id === this.app.user.id;
    const member = this.members.find((x) => x.user_id === m.sender_id);
    const sender = member?.profile || null;
    const senderName = isOwn ? "Ты" : (sender?.nickname || sender?.username || "User");

    if (m.deleted_at) {
      const row = document.createElement("div");
      row.className = "msg-row" + (isOwn ? " own" : "");
      row.dataset.messageId = m.id;
      row.innerHTML = `<div class="msg-bubble"><div class="msg-deleted">Сообщение удалено</div></div>`;
      return row;
    }

    const row = document.createElement("div");
    row.className = "msg-row" + (isOwn ? " own" : "");
    row.dataset.messageId = m.id;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    if (!isOwn) {
      const h = document.createElement("div");
      h.className = "msg-sender";
      h.innerHTML = buildNameHTML(sender, { showBadge: true });
      h.style.cursor = "pointer";
      h.addEventListener("click", () => {
        if (sender) this.app.profileService.openUserProfile(sender.id, sender);
      });
      bubble.appendChild(h);
    }

    const content = document.createElement("div");
    content.className = "msg-content";
    this.renderContent(content, m);
    bubble.appendChild(content);

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.innerHTML = `${m.edited_at ? '<span class="msg-edited">(изменено)</span>' : ""}<span>${escapeHtml(formatTime(m.created_at))}</span>`;
    bubble.appendChild(meta);

    row.appendChild(bubble);
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.openMessageContextMenu(e, m, isOwn);
    });
    return row;
  }

  renderContent(el, m) {
    el.innerHTML = "";
    const kind = m.kind || "text";
    if (kind === "image" && m.attachment_url) {
      const img = document.createElement("img");
      img.className = "msg-image"; img.src = m.attachment_url; img.loading = "lazy";
      img.addEventListener("click", () => this.app.settingsService.openLightbox(m.attachment_url, "image"));
      el.appendChild(img);
      return;
    }
    if (kind === "video" && m.attachment_url) {
      const vp = new VideoPlayerWidget(m.attachment_url, {
        fileName: m.file_name, fileSize: m.file_size,
      });
      el.appendChild(vp.render());
      return;
    }
    if (kind === "file" && m.attachment_url) {
      const a = document.createElement("a");
      a.className = "msg-file"; a.href = m.attachment_url;
      a.target = "_blank"; a.rel = "noopener noreferrer"; a.download = m.file_name || "";
      a.innerHTML = `<div class="msg-file-icon">📄</div><div><div class="msg-file-name">${escapeHtml(m.file_name || "Файл")}</div><div class="msg-file-size">${escapeHtml(humanSize(m.file_size))}</div></div>`;
      el.appendChild(a);
      return;
    }
    el.innerHTML = renderMarkdown(m.content || "");
  }

  openMessageContextMenu(event, m, isOwn) {
    this.app.closeContextMenu();
    const menu = document.createElement("div");
    menu.className = "ctx-menu"; menu.id = "ctx-menu";
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
    mk("📋 Копировать", () => {
      navigator.clipboard.writeText(m.content || m.attachment_url || "");
      toast("Скопировано", "success");
    });
    if (isOwn) mk("🗑 Удалить", () => this.deleteMessageForMe(m), true);
    if (isOwn || this.hasPerm("delete_messages")) {
      mk("🗑 Удалить у всех", () => this.deleteMessageForEveryone(m), true);
    }
    document.body.appendChild(menu);
    const r = event.target.getBoundingClientRect();
    menu.style.left = Math.min(r.left, window.innerWidth - 220) + "px";
    menu.style.top = Math.min(r.bottom, window.innerHeight - 220) + "px";
    setTimeout(() => document.addEventListener("click", () => this.app.closeContextMenu(), { once: true }), 0);
  }

  async deleteMessageForMe(m) {
    if (!confirm("Удалить только у себя?")) return;
    this.messages = this.messages.filter((x) => x.id !== m.id);
    this.renderMessages();
    toast("Удалено у тебя", "success");
  }

  async deleteMessageForEveryone(m) {
    if (!confirm("Удалить у всех?")) return;
    try {
      const { error } = await supabase.rpc("delete_community_message_for_everyone", {
        p_message_id: m.id,
      });
      if (error) throw error;
      const i = this.messages.findIndex((x) => x.id === m.id);
      if (i >= 0) {
        this.messages[i].deleted_at = new Date().toISOString();
        this.messages[i].deleted_by = this.app.user.id;
        this.renderMessages();
      }
      toast("Удалено у всех", "success");
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  async sendFromComposer() {
    const ta = $("community-composer");
    if (!ta) return;
    const text = ta.value.trim();
    if (!text || !this.activeChannel || !this.activeCommunity) return;
    if (!this.hasPerm("send_messages")) {
      return toast("Нет прав на отправку", "warning");
    }
    ta.value = "";
    ta.style.height = "auto";
    try {
      const { data, error } = await supabase.from("community_messages").insert({
        channel_id: this.activeChannel.id,
        community_id: this.activeCommunity.id,
        sender_id: this.app.user.id,
        content: text,
        kind: "text",
      }).select().single();
      if (error) throw error;
      if (!this.messages.find((x) => x.id === data.id)) {
        this.messages.push(data);
        this.renderMessages();
      }
      this.app.sounds?.send();
    } catch (e) { toast(e.message || "Ошибка отправки", "error"); }
  }

  openChannelContextMenu(event, ch) {
    this.app.closeContextMenu();
    const menu = document.createElement("div");
    menu.className = "ctx-menu"; menu.id = "ctx-menu";
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
    if (this.hasPerm("manage_channels")) {
      mk("✎ Переименовать", () => this.renameChannelDialog(ch));
      mk("✎ Тема канала", () => this.editChannelTopicDialog(ch));
      mk("🗑 Удалить канал", () => this.deleteChannel(ch), true);
    } else {
      menu.innerHTML = `<button disabled style="opacity:.5;cursor:default">Нет прав на управление</button>`;
    }
    document.body.appendChild(menu);
    const r = event.target.getBoundingClientRect();
    menu.style.left = Math.min(r.left, window.innerWidth - 220) + "px";
    menu.style.top = Math.min(r.bottom, window.innerHeight - 220) + "px";
    setTimeout(() => document.addEventListener("click", () => this.app.closeContextMenu(), { once: true }), 0);
  }

  async renameChannelDialog(ch) {
    const name = prompt("Новое имя канала:", ch.name);
    if (!name) return;
    try {
      const { error } = await supabase.from("community_channels")
        .update({ name: name.trim() }).eq("id", ch.id);
      if (error) throw error;
      await this.loadCategoriesAndChannels();
      this.renderSidebar();
      toast("Переименовано", "success");
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  async editChannelTopicDialog(ch) {
    const topic = prompt("Тема канала:", ch.topic || "");
    if (topic === null) return;
    try {
      const { error } = await supabase.from("community_channels")
        .update({ topic: topic.trim() }).eq("id", ch.id);
      if (error) throw error;
      await this.loadCategoriesAndChannels();
      if (this.activeChannel?.id === ch.id) {
        const topicEl = $("community-channel-topic");
        if (topicEl) topicEl.textContent = topic.trim();
        this.activeChannel.topic = topic.trim();
      }
      toast("Сохранено", "success");
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  async deleteChannel(ch) {
    if (!confirm(`Удалить канал #${ch.name}?`)) return;
    try {
      const { error } = await supabase.from("community_channels").delete().eq("id", ch.id);
      if (error) throw error;
      if (this.activeChannel?.id === ch.id) {
        this.activeChannel = null;
        $("community-channel-view")?.classList.add("hidden");
        $("community-empty")?.classList.remove("hidden");
      }
      await this.loadCategoriesAndChannels();
      this.renderSidebar();
      toast("Канал удалён", "warning");
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  openCreateChannelDialog(categoryId) {
    this.app.openModal({
      title: "Создать канал",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <div class="form-group"><label>Тип</label><div style="display:flex;gap:8px" id="cc-type">
            <button class="btn btn-primary" data-type="text"># Текстовый</button>
            <button class="btn btn-ghost" data-type="voice">🔊 Голосовой</button>
          </div></div>
          <div class="form-group"><label>Имя канала</label><input id="cc-name" maxlength="40" placeholder="general"></div>
          <div class="form-group"><label>Тема (необязательно)</label><input id="cc-topic" maxlength="120" placeholder="О чём канал"></div>
          <div id="cc-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="cc-cancel">Отмена</button>
            <button class="btn btn-primary" id="cc-create">Создать</button>
          </div>`;
        let type = "text";
        const typeBox = body.querySelector("#cc-type");
        typeBox.querySelectorAll("button").forEach((b) => {
          b.addEventListener("click", () => {
            type = b.dataset.type;
            typeBox.querySelectorAll("button").forEach((x) => x.className = "btn btn-ghost");
            b.className = "btn btn-primary";
          });
        });
        body.querySelector("#cc-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#cc-create").addEventListener("click", async () => {
          const errEl = body.querySelector("#cc-error");
          errEl.classList.remove("show");
          const name = body.querySelector("#cc-name").value.trim().toLowerCase().replace(/\s+/g, "-");
          const topic = body.querySelector("#cc-topic").value.trim();
          if (!name) {
            errEl.textContent = "Введи имя";
            errEl.classList.add("show");
            return;
          }
          try {
            const maxPos = this.channels
              .filter((c) => c.category_id === (categoryId || null))
              .reduce((a, c) => Math.max(a, c.position || 0), 0);
            const { error } = await supabase.from("community_channels").insert({
              community_id: this.activeCommunity.id,
              category_id: categoryId || null,
              name, type, topic,
              position: maxPos + 1,
            });
            if (error) throw error;
            this.app.closeModal();
            await this.loadCategoriesAndChannels();
            this.renderSidebar();
            toast("Канал создан", "success");
          } catch (e) {
            errEl.textContent = e.message || "Ошибка";
            errEl.classList.add("show");
          }
        });
      },
    });
  }

  openCreateCategoryDialog() {
    this.app.openModal({
      title: "Создать категорию",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <div class="form-group"><label>Название</label><input id="cat-name" maxlength="40" placeholder="INFORMATION"></div>
          <div id="cat-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="cat-cancel">Отмена</button>
            <button class="btn btn-primary" id="cat-create">Создать</button>
          </div>`;
        body.querySelector("#cat-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#cat-create").addEventListener("click", async () => {
          const errEl = body.querySelector("#cat-error");
          errEl.classList.remove("show");
          const name = body.querySelector("#cat-name").value.trim();
          if (!name) {
            errEl.textContent = "Введи имя";
            errEl.classList.add("show");
            return;
          }
          try {
            const maxPos = this.categories.reduce((a, c) => Math.max(a, c.position || 0), 0);
            const { error } = await supabase.from("community_categories").insert({
              community_id: this.activeCommunity.id,
              name, position: maxPos + 1,
            });
            if (error) throw error;
            this.app.closeModal();
            await this.loadCategoriesAndChannels();
            this.renderSidebar();
            toast("Категория создана", "success");
          } catch (e) {
            errEl.textContent = e.message || "Ошибка";
            errEl.classList.add("show");
          }
        });
      },
    });
  }

  /* ---------- Members ---------- */
  renderMembers() {
    const list = $("community-members-list");
    if (!list) return;
    list.innerHTML = "";
    const owner = this.members.find((m) => m.user_id === this.activeCommunity.owner_id);
    const others = this.members.filter((m) => m.user_id !== this.activeCommunity.owner_id);

    const renderRow = (m, isOwner) => {
      const p = m.profile;
      if (!p) return;
      const roleIds = this.memberRoles[m.user_id] || [];
      const roleNames = roleIds
        .map((rid) => this.roles.find((r) => r.id === rid)?.name)
        .filter(Boolean);
      const row = document.createElement("div");
      row.className = "community-member-row";
      row.innerHTML = `
        ${avatarHTML(p, "sm")}
        <div class="cm-body">
          <div class="cm-name">${buildNameHTML(p, { showBadge: true })}${isOwner ? ' <span class="badge success" style="font-size:9px">OWNER</span>' : ""}</div>
          ${roleNames.length ? `<div class="cm-roles">${roleNames.map((r) => `<span class="community-role-dot" style="background:#9aa0ff"></span>${escapeHtml(r)}`).join(" · ")}</div>` : ""}
        </div>`;
      row.addEventListener("click", () => this.openMemberMenu(m));
      list.appendChild(row);
    };
    if (owner) renderRow(owner, true);
    others.forEach((m) => renderRow(m, false));
  }

  openMemberMenu(m) {
    const p = m.profile;
    if (!p) return;
    const isSelf = p.id === this.app.user.id;
    this.app.openModal({
      title: p.username,
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <div class="profile-hero">
            ${avatarHTML(p, "lg")}
            <div class="profile-hero-name">${buildNameHTML(p)}</div>
            <div class="profile-id-badge">${escapeHtml(p.nexora_id)}</div>
          </div>
          <div id="mm-actions" style="display:flex;flex-direction:column;gap:8px;margin-top:16px"></div>`;
        const actions = body.querySelector("#mm-actions");
        const addBtn = (label, handler, danger = false) => {
          const b = document.createElement("button");
          b.className = "btn " + (danger ? "btn-danger" : "btn-ghost") + " btn-block";
          b.textContent = label;
          b.addEventListener("click", handler);
          actions.appendChild(b);
        };
        if (!isSelf) addBtn("💬 Написать", () => {
          this.app.closeModal();
          this.app.chatService.openDirectChat(p);
        });
        if (this.hasPerm("manage_roles") || this.activeCommunity.owner_id === this.app.user.id) {
          addBtn("🎭 Назначить роли", () => {
            this.app.closeModal();
            this.openAssignRolesDialog(m);
          });
        }
        if (!isSelf && this.hasPerm("manage_members")) {
          addBtn("🚪 Кикнуть", () => this.kickMember(m), true);
        }
      },
    });
  }

  async kickMember(m) {
    if (!confirm(`Кикнуть ${m.profile.username}?`)) return;
    try {
      const { error } = await supabase.from("community_members").delete()
        .eq("community_id", this.activeCommunity.id)
        .eq("user_id", m.user_id);
      if (error) throw error;
      this.app.closeModal();
      await this.loadMembers();
      this.renderMembers();
      toast("Кикнут", "warning");
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  openAssignRolesDialog(m) {
    this.app.openModal({
      title: "Роли участника",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">${escapeHtml(m.profile.username)}</p>
          <div id="ar-list"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="ar-close">Закрыть</button>
          </div>`;
        const list = body.querySelector("#ar-list");
        const myRoles = new Set(this.memberRoles[m.user_id] || []);
        this.roles.forEach((r) => {
          const row = document.createElement("div");
          row.className = "settings-row";
          row.innerHTML = `<div class="settings-row-info"><div class="settings-row-label"><span class="community-role-dot" style="background:${r.color || "#9aa0ff"}"></span>${escapeHtml(r.name)} ${r.is_everyone ? '<span class="badge muted" style="font-size:9px">default</span>' : ""}</div></div>`;
          const sw = document.createElement("div");
          sw.className = "switch" + (myRoles.has(r.id) ? " on" : "");
          if (r.is_everyone) {
            sw.style.opacity = "0.4";
            sw.style.pointerEvents = "none";
          } else {
            sw.addEventListener("click", async () => {
              const next = !sw.classList.contains("on");
              sw.classList.toggle("on", next);
              try {
                if (next) {
                  await supabase.from("community_member_roles").insert({
                    community_id: this.activeCommunity.id,
                    user_id: m.user_id,
                    role_id: r.id,
                  });
                } else {
                  await supabase.from("community_member_roles").delete()
                    .eq("community_id", this.activeCommunity.id)
                    .eq("user_id", m.user_id)
                    .eq("role_id", r.id);
                }
                await this.loadMembers();
                this.renderMembers();
              } catch (e) {
                sw.classList.toggle("on", !next);
                toast(e.message || "Ошибка", "error");
              }
            });
          }
          row.appendChild(sw);
          list.appendChild(row);
        });
        body.querySelector("#ar-close").addEventListener("click", () => this.app.closeModal());
      },
    });
  }

  openRolesManager() {
    this.app.openModal({
      title: "Роли",
      wide: true,
      body: (body) => {
        body.innerHTML = `
          <button class="btn btn-primary btn-block" id="roles-new" style="margin-bottom:14px">＋ Создать роль</button>
          <div id="roles-list"></div>`;
        const list = body.querySelector("#roles-list");
        this.roles.forEach((r) => {
          const row = document.createElement("div");
          row.className = "settings-row";
          row.innerHTML = `<div class="settings-row-info"><div class="settings-row-label"><span class="community-role-dot" style="background:${r.color || "#9aa0ff"}"></span>${escapeHtml(r.name)} ${r.is_everyone ? '<span class="badge muted" style="font-size:9px">default</span>' : ""}</div><div class="settings-row-desc">${Object.entries(r.permissions || {}).filter(([, v]) => v === true).length} прав</div></div>`;
          const b = document.createElement("button");
          b.className = "btn btn-ghost";
          b.textContent = "Открыть";
          b.addEventListener("click", () => {
            this.app.closeModal();
            this.openRoleEditor(r);
          });
          row.appendChild(b);
          list.appendChild(row);
        });
        body.querySelector("#roles-new").addEventListener("click", () => {
          this.app.closeModal();
          this.openRoleEditor(null);
        });
      },
    });
  }

  openRoleEditor(role) {
    const isNew = !role;
    const draft = role
      ? JSON.parse(JSON.stringify(role))
      : { name: "Новая роль", color: "#9aa0ff", position: 1, is_everyone: false, permissions: {} };
    this.app.openModal({
      title: isNew ? "Новая роль" : `Роль: ${role.name}`,
      wide: true,
      body: (body) => {
        body.innerHTML = `
          <div class="form-group"><label>Название</label><input id="re-name" maxlength="40" value="${escapeHtml(draft.name)}"></div>
          <div class="form-group"><label>Цвет</label><input id="re-color" type="color" value="${escapeHtml(draft.color)}" style="height:40px;padding:4px"></div>
          <div class="settings-section" style="margin-top:6px"><h3>Права</h3><div id="re-perms"></div></div>
          <div id="re-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            ${isNew ? "" : '<button class="btn btn-danger" id="re-delete">Удалить</button>'}
            <button class="btn btn-ghost" id="re-cancel">Отмена</button>
            <button class="btn btn-primary" id="re-save">Сохранить</button>
          </div>`;
        const permsBox = body.querySelector("#re-perms");
        Object.entries(COMMUNITY_PERMS).forEach(([key, meta]) => {
          const row = document.createElement("div");
          row.className = "perm-row";
          row.innerHTML = `<div class="perm-row-label">${escapeHtml(meta.label)}<div class="perm-row-desc">${escapeHtml(meta.desc)}</div></div>`;
          const sw = document.createElement("div");
          sw.className = "switch" + (draft.permissions?.[key] === true ? " on" : "");
          sw.addEventListener("click", () => {
            const next = !sw.classList.contains("on");
            sw.classList.toggle("on", next);
            if (!draft.permissions) draft.permissions = {};
            draft.permissions[key] = next;
          });
          row.appendChild(sw);
          permsBox.appendChild(row);
        });
        body.querySelector("#re-cancel").addEventListener("click", () => this.app.closeModal());
        if (!isNew) {
          body.querySelector("#re-delete").addEventListener("click", async () => {
            if (draft.is_everyone) return toast("Нельзя удалить @everyone", "warning");
            if (!confirm(`Удалить роль ${draft.name}?`)) return;
            try {
              const { error } = await supabase.from("community_roles").delete().eq("id", draft.id);
              if (error) throw error;
              this.app.closeModal();
              await this.loadRoles();
              await this.loadMembers();
              this.renderMembers();
              toast("Роль удалена", "warning");
            } catch (e) { toast(e.message || "Ошибка", "error"); }
          });
        }
        body.querySelector("#re-save").addEventListener("click", async () => {
          const errEl = body.querySelector("#re-error");
          errEl.classList.remove("show");
          const name = body.querySelector("#re-name").value.trim();
          const color = body.querySelector("#re-color").value;
          if (!name) {
            errEl.textContent = "Введи имя";
            errEl.classList.add("show");
            return;
          }
          try {
            if (isNew) {
              const maxPos = this.roles.reduce((a, r) => Math.max(a, r.position || 0), 0);
              await supabase.from("community_roles").insert({
                community_id: this.activeCommunity.id,
                name, color,
                position: maxPos + 1,
                is_everyone: false,
                permissions: draft.permissions || {},
              });
            } else {
              await supabase.from("community_roles").update({
                name, color,
                permissions: draft.permissions || {},
              }).eq("id", draft.id);
            }
            this.app.closeModal();
            await this.loadRoles();
            await this.loadMembers();
            this.renderMembers();
            toast("Сохранено", "success");
          } catch (e) {
            errEl.textContent = e.message || "Ошибка";
            errEl.classList.add("show");
          }
        });
      },
    });
  }

  /* ---------- Create community / invite ---------- */
  openCreateDialog() {
    this.app.openModal({
      title: "Создать сообщество",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <div class="form-group"><label>Название</label><input id="ncom-name" maxlength="60" placeholder="Моё сообщество"></div>
          <div class="form-group"><label>Описание</label><textarea id="ncom-desc" rows="2" maxlength="200"></textarea></div>
          <label style="display:flex;gap:10px;align-items:center;cursor:pointer;padding:6px 0"><input type="checkbox" id="ncom-pub" style="width:auto"><span>Публичное сообщество</span></label>
          <div id="ncom-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="ncom-cancel">Отмена</button>
            <button class="btn btn-primary" id="ncom-create">Создать</button>
          </div>`;
        body.querySelector("#ncom-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#ncom-create").addEventListener("click", async () => {
          const errEl = body.querySelector("#ncom-error");
          errEl.classList.remove("show");
          const name = body.querySelector("#ncom-name").value.trim();
          const desc = body.querySelector("#ncom-desc").value.trim();
          const isPub = body.querySelector("#ncom-pub").checked;
          if (!name) {
            errEl.textContent = "Введи название";
            errEl.classList.add("show");
            return;
          }
          try {
            const { data, error } = await supabase.rpc("create_community", {
              p_name: name,
              p_description: desc,
              p_is_public: isPub,
            });
            if (error) throw error;
            this.app.closeModal();
            await this.loadCommunities();
            await this.selectCommunity(data);
            this.app.sounds?.success();
            toast("Сообщество создано", "success");
          } catch (e) {
            errEl.textContent = e.message || "Ошибка";
            errEl.classList.add("show");
          }
        });
      },
    });
  }

  async openInviteDialog() {
    if (!this.activeCommunity) return;
    try {
      const { data, error } = await supabase.rpc("create_community_invite", {
        p_community_id: this.activeCommunity.id,
        p_expires_in_hours: 24,
        p_max_uses: null,
      });
      if (error) throw error;
      const token = data;
      const url = `${location.origin}${location.pathname}?community=${token}`;
      this.app.openModal({
        title: "Приглашение",
        narrow: true,
        body: (body) => {
          body.innerHTML = `
            <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">Ссылка действует 24 часа.</p>
            <div class="share-row"><span class="share-link" id="inv-link">${escapeHtml(url)}</span></div>`;
          body.querySelector("#inv-link").addEventListener("click", () => {
            navigator.clipboard.writeText(url);
            toast("Скопировано", "success");
          });
          const f = this.app._openModal.footerEl;
          f.innerHTML = "";
          const copy = document.createElement("button");
          copy.className = "btn btn-primary";
          copy.textContent = "Копировать ссылку";
          copy.addEventListener("click", () => {
            navigator.clipboard.writeText(url);
            toast("Скопировано", "success");
          });
          f.appendChild(copy);
        },
      });
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  async openJoinByLinkDialog() {
    const raw = prompt("Вставь ссылку или токен:");
    if (!raw) return;
    let token = raw.trim();
    try {
      const u = new URL(raw);
      const p = u.searchParams.get("community");
      if (p) token = p;
    } catch (_) {}
    try {
      const { data: ch } = await supabase.from("community_invites")
        .select("community_id").eq("token", token).maybeSingle();
      if (!ch) return toast("Неверная ссылка", "error");
      const { error } = await supabase.rpc("join_community", {
        p_community_id: ch.community_id,
        p_invite_token: token,
      });
      if (error) throw error;
      await this.loadCommunities();
      await this.selectCommunity(ch.community_id);
      toast("Присоединились", "success");
      this.app.sounds?.success();
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  async handleCommunityDeepLink() {
    const params = new URLSearchParams(location.search);
    const token = params.get("community");
    if (!token) return false;
    try {
      const { data: ch } = await supabase.from("community_invites")
        .select("community_id").eq("token", token).maybeSingle();
      if (!ch) { toast("Приглашение не найдено", "warning"); return false; }
      const { error } = await supabase.rpc("join_community", {
        p_community_id: ch.community_id,
        p_invite_token: token,
      });
      if (error) throw error;
      this.open();
      setTimeout(() => this.selectCommunity(ch.community_id), 300);
      return true;
    } catch (e) { toast(e.message || "Ошибка", "warning"); return false; }
  }

  openCommunityMenu() {
    if (!this.activeCommunity) return;
    this.app.openModal({
      title: this.activeCommunity.name,
      narrow: true,
      body: (body) => {
        body.innerHTML = `<div id="cm-actions" style="display:flex;flex-direction:column;gap:8px"></div>`;
        const actions = body.querySelector("#cm-actions");
        const addBtn = (label, handler, danger = false) => {
          const b = document.createElement("button");
          b.className = "btn " + (danger ? "btn-danger" : "btn-ghost") + " btn-block";
          b.textContent = label;
          b.addEventListener("click", handler);
          actions.appendChild(b);
        };
        if (this.hasPerm("create_invites")) {
          addBtn("🔗 Пригласить", () => {
            this.app.closeModal();
            this.openInviteDialog();
          });
        }
        if (this.hasPerm("manage_roles")) {
          addBtn("🎭 Роли", () => {
            this.app.closeModal();
            this.openRolesManager();
          });
        }
        if (this.hasPerm("manage_channels")) {
          addBtn("＋ Канал", () => {
            this.app.closeModal();
            this.openCreateChannelDialog(null);
          });
          addBtn("＋ Категория", () => {
            this.app.closeModal();
            this.openCreateCategoryDialog();
          });
        }
        if (this.activeCommunity.owner_id === this.app.user.id) {
          addBtn("🗑 Удалить сообщество", () => this.deleteCommunity(), true);
        } else {
          addBtn("🚪 Покинуть сообщество", () => this.leaveCommunity(), true);
        }
      },
    });
  }

  async leaveCommunity() {
    if (!confirm("Покинуть сообщество?")) return;
    try {
      const { error } = await supabase.from("community_members").delete()
        .eq("community_id", this.activeCommunity.id)
        .eq("user_id", this.app.user.id);
      if (error) throw error;
      this.app.closeModal();
      this.activeCommunity = null;
      await this.loadCommunities();
      if (this.communities.length) await this.selectCommunity(this.communities[0].id);
      else this.showEmptyState();
      toast("Покинули", "warning");
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  async deleteCommunity() {
    if (!confirm(`Удалить сообщество «${this.activeCommunity.name}»? Все каналы и сообщения будут потеряны.`)) return;
    try {
      const { error } = await supabase.from("communities").delete().eq("id", this.activeCommunity.id);
      if (error) throw error;
      this.app.closeModal();
      this.activeCommunity = null;
      await this.loadCommunities();
      if (this.communities.length) await this.selectCommunity(this.communities[0].id);
      else this.showEmptyState();
      toast("Сообщество удалено", "warning");
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  /* ---------- Subscriptions ---------- */
  unsubscribeAll() {
    if (this._channelsSub) { supabase.removeChannel(this._channelsSub); this._channelsSub = null; }
    if (this._membersSub) { supabase.removeChannel(this._membersSub); this._membersSub = null; }
    if (this._rolesSub) { supabase.removeChannel(this._rolesSub); this._rolesSub = null; }
    if (this._channelSub) { supabase.removeChannel(this._channelSub); this._channelSub = null; }
    if (this._msgSub) { supabase.removeChannel(this._msgSub); this._msgSub = null; }
  }

  subscribeCommunity() {
    if (this._channelsSub) supabase.removeChannel(this._channelsSub);
    const cid = this.activeCommunity.id;
    this._channelsSub = supabase.channel("community-channels:" + cid)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "community_channels", filter: `community_id=eq.${cid}` },
        async () => {
          await this.loadCategoriesAndChannels();
          this.renderSidebar();
        })
      .subscribe();

    if (this._membersSub) supabase.removeChannel(this._membersSub);
    this._membersSub = supabase.channel("community-members:" + cid)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "community_members", filter: `community_id=eq.${cid}` },
        async () => {
          await this.loadMembers();
          this.renderMembers();
        })
      .subscribe();

    if (this._rolesSub) supabase.removeChannel(this._rolesSub);
    this._rolesSub = supabase.channel("community-roles:" + cid)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "community_roles", filter: `community_id=eq.${cid}` },
        async () => {
          await this.loadRoles();
          await this.loadMembers();
          await this.loadMyPermissions();
          this.renderMembers();
        })
      .subscribe();
  }

  subscribeChannel(channelId) {
    if (this._channelSub) supabase.removeChannel(this._channelSub);
    this._channelSub = supabase.channel("community-msg:" + channelId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "community_messages", filter: `channel_id=eq.${channelId}` },
        (p) => {
          if (p.eventType === "INSERT") {
            const m = p.new;
            if (!m) return;
            if (this.messages.find((x) => x.id === m.id)) return;
            this.messages.push(m);
            this.renderMessages();
            if (m.sender_id !== this.app.user.id) this.app.sounds?.message();
          } else if (p.eventType === "UPDATE") {
            const i = this.messages.findIndex((x) => x.id === p.new.id);
            if (i >= 0) {
              this.messages[i] = p.new;
              this.renderMessages();
            }
          } else if (p.eventType === "DELETE") {
            this.messages = this.messages.filter((x) => x.id !== p.old.id);
            this.renderMessages();
          }
        })
      .subscribe();
  }
}