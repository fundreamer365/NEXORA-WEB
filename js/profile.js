/* ============================================================
   NEXORA — js/profile.js
   Профиль: загрузка, обновление, аватарки, badges, темы,
   открытие своего/чужого профиля, кастомизация.
   Импортирует: ./supabase.js, ./util.js, ../themes.js
   ============================================================ */

import { supabase, AVATAR_BUCKET, BADGE_BUCKET, SOUND_BUCKET,
         AVATAR_MAX, COVER_MAX, BADGE_MAX, SOUND_MAX } from "./supabase.js";
import { $, $$, escapeHtml, safeUrl, toast, formatTime,
         lsGet, lsSet, STATUS_META, humanSize } from "./util.js";
import { PROFILE_THEMES, applyProfileTheme, getProfileTheme } from "../themes.js";

/* ---------- Константы для UI ---------- */
export const BADGE_EMOJIS = [
  "🔥","⚡","🌀","💎","🎮","🎧","🎨","🚀","🌙","⭐","❄","🌸",
  "🍕","☕","💜","🖤","🐱","🐉","🦊","🎯","🏆","🛡","⚔","🌈",
];

export const ANIMATED_BADGES = [
  "anim-heart","anim-star","anim-fire","anim-crystal","anim-bolt",
  "anim-ring","anim-ghost","anim-planet","anim-pulse","anim-skull",
  "anim-rainbow","anim-spark","anim-cat","anim-unicorn",
];

export const NAME_COLOR_PRESETS = [
  null,
  "#ff5a6e","#ffb547","#3ddc84","#4da6ff","#7c5cff","#ff6ad5","#5ce1e6","#a78bfa","#ffffff",
  "linear-gradient(90deg,#ff5a6e,#ffb547,#3ddc84,#4da6ff,#7c5cff)",
  "linear-gradient(90deg,#7c5cff,#4da6ff)",
  "linear-gradient(90deg,#ff6ad5,#ffb547)",
];

export const VOICE_WALLPAPERS = [
  null,
  { id: "vp-aurora", name: "Aurora", css: "linear-gradient(135deg,#7c5cff,#4da6ff,#3ddc84,#ff6ad5)" },
  { id: "vp-fire",   name: "Fire",   css: "linear-gradient(135deg,#ff5a6e,#ffb547,#ff6ad5)" },
  { id: "vp-ocean",  name: "Ocean",  css: "linear-gradient(135deg,#0a0a0f,#4d3fbf,#4da6ff,#5ce1e6)" },
  { id: "vp-nord",   name: "Nord",   css: "linear-gradient(135deg,#2e3440,#5e81ac,#88c0d0)" },
];

export const SOCIAL_META = {
  telegram:         { label: "Telegram",         icon: "✈", color: "#26a5e4", placeholder: "https://t.me/username" },
  telegram_channel: { label: "Telegram Channel", icon: "📣", color: "#26a5e4", placeholder: "https://t.me/channel" },
  steam:            { label: "Steam",            icon: "🎮", color: "#66c0f4", placeholder: "https://steamcommunity.com/id/..." },
  itch:             { label: "itch.io",          icon: "🕹", color: "#fa5c5c", placeholder: "https://username.itch.io" },
  github:           { label: "GitHub",           icon: "🐙", color: "#e6e6e6", placeholder: "https://github.com/username" },
  youtube:          { label: "YouTube",          icon: "▶", color: "#ff0033", placeholder: "https://youtube.com/@channel" },
  discord:          { label: "Discord",          icon: "💬", color: "#5865f2", placeholder: "https://discord.gg/invite" },
  website:          { label: "Website",          icon: "🌐", color: "#9aa0ff", placeholder: "https://example.com" },
  twitch:           { label: "Twitch",           icon: "🎥", color: "#9146ff", placeholder: "https://twitch.tv/username" },
  vk:               { label: "VK",               icon: "🅥", color: "#4680c2", placeholder: "https://vk.com/username" },
  reddit:           { label: "Reddit",           icon: "👽", color: "#ff4500", placeholder: "https://reddit.com/user/username" },
  x:                { label: "X",                icon: "✖", color: "#e6e6e6", placeholder: "https://x.com/username" },
  linkedin:         { label: "LinkedIn",         icon: "in", color: "#0a66c2", placeholder: "https://linkedin.com/in/username" },
  spotify:          { label: "Spotify",          icon: "♫", color: "#1db954", placeholder: "https://open.spotify.com/user/..." },
  bandcamp:         { label: "Bandcamp",         icon: "🎵", color: "#629aa9", placeholder: "https://username.bandcamp.com" },
  behance:          { label: "Behance",          icon: "Bē", color: "#1769ff", placeholder: "https://behance.net/username" },
  dribbble:         { label: "Dribbble",         icon: "●", color: "#ea4c89", placeholder: "https://dribbble.com/username" },
};

/* ============================================================
   Avatar HTML — компактная функция для списков
   ============================================================ */
export function avatarHTML(user, size = "md", extraClass = "") {
  const name = (user?.username || "?").trim();
  const initial = name ? name[0].toUpperCase() : "?";
  const cls = `avatar avatar-${size}${extraClass ? " " + extraClass : ""}`;
  const status = user?.status || "online";
  const online = user?.is_online && user?.show_online !== false
                 && !user?.is_bot && status !== "invisible";
  const onlineCls = online ? " online-glow" : "";
  const dotColor = STATUS_META[status]?.color || "#3ddc84";
  const dot = online
    ? `<span class="online-dot" style="background:${dotColor};box-shadow:0 0 8px ${dotColor}"></span>`
    : "";
  if (user?.avatar_url) {
    const safe = safeUrl(user.avatar_url);
    if (safe) {
      return `<div class="avatar-wrap"><div class="${cls}${onlineCls}" style="background-image:url('${safe}')"></div>${dot}</div>`;
    }
  }
  return `<div class="avatar-wrap"><div class="${cls}${onlineCls}">${escapeHtml(initial)}</div>${dot}</div>`;
}

export function paintAvatar(el, user) {
  if (!el) return;
  const name = (user?.username || "?").trim();
  if (user?.avatar_url) {
    const safe = safeUrl(user.avatar_url);
    if (safe) {
      el.style.backgroundImage = `url('${safe}')`;
      el.textContent = "";
      return;
    }
  }
  el.style.backgroundImage = "";
  el.textContent = name ? name[0].toUpperCase() : "?";
}

/* ============================================================
   buildNameHTML — цвет, титул, badge
   ============================================================ */
export function buildNameHTML(user, { showTitle = true, showBadge = true } = {}) {
  const name = escapeHtml(user?.nickname || user?.username || "?");
  const color = user?.name_color;
  const title = user?.name_title;
  const badgeEmoji = user?.badge_emoji;
  const badgeUrl = user?.badge_url;
  const badgeAnim = user?.badge_anim;

  let style = "";
  if (color) {
    if (color.startsWith("linear-gradient")) {
      style = `background:${color};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;`;
    } else if (/^#[0-9a-fA-F]{3,8}$/.test(color)) {
      style = `color:${color};`;
    }
  }

  let badgeHTML = "";
  if (showBadge) {
    if (badgeAnim && ANIMATED_BADGES.includes(badgeAnim)) {
      badgeHTML = `<span class="name-badge"><svg viewBox="0 0 24 24"><use href="#${badgeAnim}"/></svg></span>`;
    } else if (badgeUrl) {
      const safe = safeUrl(badgeUrl);
      if (safe) badgeHTML = `<span class="name-badge"><img src="${safe}" alt=""></span>`;
    } else if (badgeEmoji) {
      badgeHTML = `<span class="name-badge">${escapeHtml(badgeEmoji)}</span>`;
    }
  }

  let titleHTML = "";
  if (showTitle && title) {
    titleHTML = `<span class="name-title">${escapeHtml(title)}</span>`;
  }

  return `<span class="name-colored" style="${style}">${name}</span>${titleHTML}${badgeHTML}`;
}

/* ============================================================
   ProfileService — методы через NEXORA
   ============================================================ */
export class ProfileService {
  constructor(app) {
    this.app = app;
  }

  /* ---------- Загрузка / обновление ---------- */
  async loadProfile() {
    if (!this.app.user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", this.app.user.id)
      .single();
    if (error) { console.error("loadProfile:", error); return; }
    this.app.profile = data;
  }

  async updateProfile(patch) {
    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", this.app.user.id)
      .select()
      .single();
    if (error) throw error;
    this.app.profile = data;
    return data;
  }

  async setOnline(online) {
    if (!this.app.user) return;
    const status = this.app.profile?.status || "online";
    const effective = online && status !== "invisible";
    try {
      await supabase
        .from("profiles")
        .update({
          is_online: effective,
          last_seen: new Date().toISOString(),
        })
        .eq("id", this.app.user.id);
      if (this.app.profile) this.app.profile.is_online = effective;
    } catch (_) {}
  }

  startPresence() {
    this.setOnline(true);
    this.app.presenceTimer = setInterval(() => this.setOnline(true), 60_000);
    window.addEventListener("beforeunload", () => {
      supabase.from("profiles").update({ is_online: false }).eq("id", this.app.user.id);
    });
    document.addEventListener("visibilitychange", () => {
      this.setOnline(!document.hidden).catch(() => {});
    });
  }

  stopPresence() {
    if (this.app.presenceTimer) {
      clearInterval(this.app.presenceTimer);
      this.app.presenceTimer = null;
    }
  }

  /* ---------- Sidebar footer ---------- */
  renderSidebarFooter() {
    const me = this.app.profile;
    if (!me) return;
    const nameEl = $("me-name");
    if (nameEl) nameEl.innerHTML = buildNameHTML(me, { showTitle: true, showBadge: true });
    const idEl = $("me-id");
    if (idEl) idEl.textContent = me.nexora_id;
    const avEl = $("me-avatar");
    if (avEl) {
      paintAvatar(avEl, me);
      if (me.avatar_pulse) avEl.classList.add("avatar-pulse");
      else avEl.classList.remove("avatar-pulse");
    }
  }

  /* ---------- Открыть свой профиль ---------- */
  openProfile() {
    this.app.openModal({
      title: "Профиль",
      wide: true,
      body: (body) => {
        const me = this.app.profile;
        const status = me.status || "online";
        const socials = me.social_links || {};
        const socialKeys = Object.keys(socials);

        body.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.className = "profile-card";

        let coverHTML = `<div class="profile-cover"></div>`;
        if (me.cover_url) {
          coverHTML = `<div class="profile-cover with-image" style="background-image:url('${safeUrl(me.cover_url)}')"></div>`;
        } else if (me.cover_preset) {
          const clsMap = {
            "gradient-1": "cover-gradient-1","gradient-2": "cover-gradient-2",
            "gradient-3": "cover-gradient-3","gradient-4": "cover-gradient-4",
            "gradient-5": "cover-gradient-5","particles": "cover-gradient-1 particles",
            "waves": "waves",
          };
          coverHTML = `<div class="profile-cover preset ${clsMap[me.cover_preset] || "cover-gradient-1"}"></div>`;
        }

        wrap.innerHTML = `
          ${coverHTML}
          <div class="profile-avatar-wrap">${avatarHTML(me, "xl", "profile-avatar-clickable")}</div>
          <div class="profile-name">${buildNameHTML(me)}</div>
          <div class="profile-id-badge" id="profile-id">${escapeHtml(me.nexora_id)}</div>
          <div class="profile-status"><span><span class="dot" style="background:${STATUS_META[status]?.color || "#3ddc84"}"></span>${escapeHtml(STATUS_META[status]?.label || "В сети")}</span></div>
          ${me.activity_text ? `<div class="activity-line animated">${escapeHtml(me.activity_text)}</div>` : ""}
          ${me.music_title ? `<div class="profile-music"><div class="profile-music-icon">♫</div><div class="profile-music-body"><div class="profile-music-title">${escapeHtml(me.music_title)}</div><div class="profile-music-artist">${escapeHtml(me.music_artist || "")}</div></div></div>` : ""}
          ${me.about ? `<div class="settings-section" style="margin-top:16px;background:var(--bg-2)"><h3 style="margin-bottom:8px">О себе</h3><div style="color:var(--text-1);font-size:13px;line-height:1.5">${escapeHtml(me.about)}</div></div>` : ""}`;

        if (socialKeys.length) {
          const soc = document.createElement("div");
          soc.className = "settings-section"; soc.style.marginTop = "16px";
          soc.innerHTML = `<h3>Ссылки</h3>`;
          const list = document.createElement("div"); list.className = "social-list";
          socialKeys.forEach((k) => {
            const meta = SOCIAL_META[k]; if (!meta) return;
            const a = document.createElement("a");
            a.className = "social-item";
            a.href = safeUrl(socials[k]);
            a.target = "_blank"; a.rel = "noopener noreferrer nofollow";
            a.innerHTML = `<span class="social-icon" style="color:${meta.color}">${meta.icon}</span> ${escapeHtml(meta.label)}`;
            list.appendChild(a);
          });
          soc.appendChild(list); wrap.appendChild(soc);
        }

        body.appendChild(wrap);

        body.querySelector("#profile-id").addEventListener("click", () => {
          navigator.clipboard.writeText(me.nexora_id);
          toast("ID скопирован", "success");
          this.app.sounds?.click();
        });

        const actions = document.createElement("div");
        actions.className = "profile-actions";

        const mkBtn = (label, handler, ghost = false, full = false) => {
          const b = document.createElement("button");
          b.className = "btn " + (ghost ? "btn-ghost" : "btn-primary") + (full ? " btn-full" : "");
          b.textContent = label;
          b.addEventListener("click", handler);
          actions.appendChild(b);
        };

        mkBtn("📷 Сменить аватар", () => $("file-avatar").click(), true);
        mkBtn("🖼️ Сменить обложку", () => { this.app.closeModal(); setTimeout(() => this.openCoverPicker(), 100); }, true);
        mkBtn("🎨 Значок", () => { this.app.closeModal(); setTimeout(() => this.openBadgePicker(), 100); }, true);
        mkBtn("🟢 Статус", () => { this.app.closeModal(); setTimeout(() => this.openStatusPicker(), 100); }, true);
        mkBtn("🔗 Соц-ссылки", () => { this.app.closeModal(); setTimeout(() => this.openSocialLinksEditor(), 100); }, true);
        mkBtn("✎ О себе", () => { this.app.closeModal(); setTimeout(() => this.openAboutEditor(), 100); }, true);
        mkBtn("📤 Поделиться ID", () => {
          const link = `${location.origin}${location.pathname}?u=${me.nexora_id}`;
          navigator.clipboard.writeText(link).then(() => {
            toast("Ссылка скопирована", "success");
            this.app.sounds?.success();
          });
        }, true);

        wrap.appendChild(actions);
      },
    });
  }

  /* ---------- Открыть чужой профиль ---------- */
  async openUserProfile(userId, peer = null) {
    this.app.openModal({
      title: "Профиль",
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
        if (!card) {
          body.innerHTML = `<div class="empty-state">Профиль не найден</div>`;
          return;
        }

        // fallback из peer
        if (!card.avatar_url && peer?.avatar_url) card.avatar_url = peer.avatar_url;
        if (!card.about && peer?.about) card.about = peer.about;
        if (!card.status && peer?.status) card.status = peer.status;
        if (!card.badge_emoji && peer?.badge_emoji) card.badge_emoji = peer.badge_emoji;
        if (!card.badge_url && peer?.badge_url) card.badge_url = peer.badge_url;
        if (!card.badge_anim && peer?.badge_anim) card.badge_anim = peer.badge_anim;
        if (!card.name_color && peer?.name_color) card.name_color = peer.name_color;
        if (!card.name_title && peer?.name_title) card.name_title = peer.name_title;
        if (!card.social_links && peer?.social_links) card.social_links = peer.social_links;

        const isSelf = card.id === this.app.user.id;
        const isBot = !!card.is_bot;
        const displayName = card.nickname || card.username;
        const status = card.status || "online";
        const online = !isBot && card.is_online
                       && card.show_online !== false
                       && status !== "invisible";
        const lastSeen = card.last_seen ? formatTime(card.last_seen) : "";
        const socials = card.social_links || {};
        const socialKeys = Object.keys(socials);

        body.innerHTML = "";
        const cardEl = document.createElement("div");
        cardEl.className = "profile-card";

        let coverHTML;
        if (card.cover_url) {
          coverHTML = `<div class="profile-cover with-image" style="background-image:url('${safeUrl(card.cover_url)}')"></div>`;
        } else if (card.cover_preset) {
          const clsMap = {
            "gradient-1": "cover-gradient-1","gradient-2": "cover-gradient-2",
            "gradient-3": "cover-gradient-3","gradient-4": "cover-gradient-4",
            "gradient-5": "cover-gradient-5","particles": "cover-gradient-1 particles",
            "waves": "waves",
          };
          coverHTML = `<div class="profile-cover preset ${clsMap[card.cover_preset] || "cover-gradient-1"}"></div>`;
        } else {
          coverHTML = `<div class="profile-cover"></div>`;
        }

        cardEl.innerHTML = `
          ${coverHTML}
          <div class="profile-avatar-wrap">${avatarHTML(card, "xl", "profile-avatar-clickable")}</div>
          <div class="profile-name">${buildNameHTML({ ...card, username: displayName })}${isBot ? ' <span class="bot-badge">[BOT]</span>' : ""}</div>
          ${card.nickname ? `<div class="profile-nickname">настоящий ник: @${escapeHtml(card.username)}</div>` : ""}
          <div class="profile-id-badge" id="card-id-copy">${escapeHtml(card.nexora_id)}</div>
          <div class="profile-status"><span><span class="dot" style="background:${STATUS_META[status]?.color || "#3ddc84"}"></span>${online ? (STATUS_META[status]?.label || "В сети") : (lastSeen ? "Был(а) " + lastSeen : "Не в сети")}</span></div>
          ${card.activity_text ? `<div class="activity-line animated">${escapeHtml(card.activity_text)}</div>` : ""}
          ${card.about ? `<div class="settings-section" style="margin-top:16px;background:var(--bg-2)"><h3 style="margin-bottom:8px">О себе</h3><div style="color:var(--text-1);font-size:13px;line-height:1.5">${escapeHtml(card.about)}</div></div>` : ""}`;

        body.appendChild(cardEl);

        if (socialKeys.length) {
          const soc = document.createElement("div");
          soc.className = "settings-section";
          soc.style.marginTop = "12px";
          soc.innerHTML = `<h3>Ссылки</h3>`;
          const list = document.createElement("div");
          list.className = "social-list";
          socialKeys.forEach((k) => {
            const meta = SOCIAL_META[k]; if (!meta) return;
            const a = document.createElement("a");
            a.className = "social-item";
            a.href = safeUrl(socials[k]);
            a.target = "_blank"; a.rel = "noopener noreferrer nofollow";
            a.innerHTML = `<span class="social-icon" style="color:${meta.color}">${meta.icon}</span> ${escapeHtml(meta.label)}`;
            list.appendChild(a);
          });
          soc.appendChild(list);
          cardEl.appendChild(soc);
        }

        cardEl.querySelector("#card-id-copy").addEventListener("click", () => {
          navigator.clipboard.writeText(card.nexora_id);
          toast("ID скопирован", "success");
          this.app.sounds?.click();
        });

        const av = cardEl.querySelector(".profile-avatar-clickable");
        if (av && card.avatar_url) {
          av.addEventListener("click", () => this.app.openLightbox(card.avatar_url, "image"));
        }

        const actions = document.createElement("div");
        actions.className = "profile-actions";

        if (isSelf) {
          const edit = document.createElement("button");
          edit.className = "btn btn-primary btn-full";
          edit.textContent = "✎ Редактировать профиль";
          edit.addEventListener("click", () => {
            this.app.closeModal();
            this.openProfile();
          });
          actions.appendChild(edit);
        } else {
          const msg = document.createElement("button");
          msg.className = "btn btn-primary btn-full";
          msg.textContent = "💬 Написать сообщение";
          msg.addEventListener("click", () => {
            this.app.closeModal();
            this.app.chatService.openDirectChat(card);
          });
          actions.appendChild(msg);

          if (isBot) {
            actions.innerHTML = "";
            const msgBot = document.createElement("button");
            msgBot.className = "btn btn-primary btn-full";
            msgBot.textContent = "💬 Открыть чат с ботом";
            msgBot.addEventListener("click", () => {
              this.app.closeModal();
              this.app.chatService.openDirectChat(card);
            });
            actions.appendChild(msgBot);
          } else {
            // rename / add contact
            const renameBtn = document.createElement("button");
            renameBtn.className = "btn btn-ghost";
            renameBtn.textContent = card.is_contact
              ? (card.nickname ? "✎ Изменить ярлык" : "✎ Переименовать")
              : "+ Добавить в контакты";
            renameBtn.addEventListener("click", () => {
              if (card.is_contact) {
                this.app.closeModal();
                this.openRenameContactDialog(card);
              } else {
                this.app.contactService.addContact(card.id)
                  .then(async () => {
                    await this.app.refreshContacts();
                    toast("Добавлен в контакты", "success");
                    this.app.sounds?.success();
                    this.app.closeModal();
                    this.openUserProfile(card.id, card);
                  })
                  .catch((e) => toast(e.message || "Ошибка", "error"));
              }
            });
            actions.appendChild(renameBtn);

            // block/unblock
            const block = document.createElement("button");
            if (card.is_blocked) {
              block.className = "btn btn-ghost btn-full";
              block.textContent = "✓ Разблокировать";
              block.addEventListener("click", async () => {
                if (!confirm("Разблокировать?")) return;
                try {
                  await this.app.blockService.unblockUser(card.id);
                  toast("Разблокирован", "success");
                  this.app.sounds?.success();
                  this.app.closeModal();
                  this.openUserProfile(card.id, card);
                } catch (e) { toast(e.message || "Ошибка", "error"); }
              });
            } else {
              block.className = "btn btn-danger";
              block.textContent = "🚫 Заблокировать";
              block.addEventListener("click", async () => {
                if (!confirm("Заблокировать?")) return;
                try {
                  await this.app.blockService.blockUser(card.id);
                  toast("Заблокирован", "warning");
                  this.app.sounds?.error();
                  this.app.closeModal();
                  this.openUserProfile(card.id, card);
                } catch (e) { toast(e.message || "Ошибка", "error"); }
              });
            }
            actions.appendChild(block);
          }
        }

        cardEl.appendChild(actions);
      },
    });
  }

  /* ---------- Rename contact ---------- */
  openRenameContactDialog(card) {
    this.app.openModal({
      title: "Ярлык контакта",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">Как показывать <b>@${escapeHtml(card.username)}</b>.</p>
          <input id="rn-input" maxlength="40" value="${escapeHtml(card.nickname || card.username)}">
          <div id="rn-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="rn-cancel">Отмена</button>
            <button class="btn btn-primary" id="rn-save">Сохранить</button>
          </div>`;
        const inp = body.querySelector("#rn-input");
        setTimeout(() => { inp.focus(); inp.select(); }, 100);
        body.querySelector("#rn-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#rn-save").addEventListener("click", async () => {
          const v = inp.value.trim();
          if (!v) return toast("Введи имя", "warning");
          try {
            const { error } = await supabase.rpc("set_contact_nickname", {
              p_contact_id: card.id,
              p_nickname: v,
            });
            if (error) throw error;
            toast("Сохранено", "success");
            this.app.sounds?.success();
            this.app.closeModal();
            await this.app.refreshChats();
            await this.app.refreshContacts();
          } catch (e) {
            const err = body.querySelector("#rn-error");
            err.textContent = e.message || "Ошибка";
            err.classList.add("show");
          }
        });
      },
    });
  }

  /* ---------- Badge picker ---------- */
  openBadgePicker() {
    this.app.openModal({
      title: "Значок рядом с именем",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">Эмодзи, анимированный SVG или своя картинка (PNG/GIF/WebP).</p>
          <div id="badge-grid" style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px"></div>
          <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost" id="badge-svg">🎬 SVG</button>
            <button class="btn btn-ghost" id="badge-upload">📷 Загрузить</button>
            <button class="btn btn-ghost" id="badge-clear">Убрать</button>
          </div>`;
        const grid = body.querySelector("#badge-grid");
        BADGE_EMOJIS.forEach((e) => {
          const b = document.createElement("button");
          b.textContent = e;
          const active = this.app.profile.badge_emoji === e;
          b.style.cssText = `aspect-ratio:1;font-size:24px;border-radius:12px;background:${active ? "var(--accent-dim)" : "var(--bg-2)"};border:1px solid ${active ? "var(--accent)" : "var(--border)"}`;
          b.addEventListener("click", async () => {
            try {
              await this.updateProfile({ badge_emoji: e, badge_url: null, badge_anim: null });
              this.app.profile.badge_emoji = e;
              this.app.profile.badge_url = null;
              this.app.profile.badge_anim = null;
              toast("Значок обновлён", "success");
              this.app.sounds?.success();
              this.app.closeModal();
              this.renderSidebarFooter();
            } catch (err) { toast(err.message || "Ошибка", "error"); }
          });
          grid.appendChild(b);
        });
        body.querySelector("#badge-svg").addEventListener("click", () => {
          this.app.closeModal();
          setTimeout(() => this.openSvgCatalog(), 100);
        });
        body.querySelector("#badge-upload").addEventListener("click", () => {
          this.app.closeModal();
          $("file-badge").click();
        });
        body.querySelector("#badge-clear").addEventListener("click", async () => {
          try {
            await this.updateProfile({ badge_emoji: null, badge_url: null, badge_anim: null });
            this.app.profile.badge_emoji = null;
            this.app.profile.badge_url = null;
            this.app.profile.badge_anim = null;
            toast("Значок убран", "warning");
            this.app.closeModal();
            this.renderSidebarFooter();
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
      },
    });
  }

  openSvgCatalog() {
    const modal = $("svg-catalog-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    const body = $("svg-catalog-body");
    body.innerHTML = "";
    ANIMATED_BADGES.forEach((id) => {
      const item = document.createElement("div");
      item.className = "svg-catalog-item";
      item.innerHTML = `<svg viewBox="0 0 24 24"><use href="#${id}"/></svg>`;
      if (this.app.profile.badge_anim === id) item.classList.add("selected");
      item.addEventListener("click", async () => {
        try {
          await this.updateProfile({ badge_anim: id, badge_emoji: null, badge_url: null });
          this.app.profile.badge_anim = id;
          this.app.profile.badge_emoji = null;
          this.app.profile.badge_url = null;
          toast("Анимированный значок установлен", "success");
          this.app.sounds?.success();
          modal.classList.add("hidden");
          this.renderSidebarFooter();
        } catch (e) { toast(e.message || "Ошибка", "error"); }
      });
      body.appendChild(item);
    });
  }

  /* ---------- Status picker ---------- */
  openStatusPicker() {
    const cur = this.app.profile.status || "online";
    this.app.openModal({
      title: "Статус",
      narrow: true,
      body: (body) => {
        body.innerHTML = "";
        Object.entries(STATUS_META).forEach(([key, meta]) => {
          const row = document.createElement("div");
          row.className = "settings-row"; row.style.cursor = "pointer";
          if (key === cur) row.style.background = "var(--accent-dim)";
          row.innerHTML = `<div class="settings-row-info"><div class="settings-row-label"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${meta.color};margin-right:8px"></span>${escapeHtml(meta.label)}</div></div>`;
          row.addEventListener("click", async () => {
            try {
              await this.updateProfile({ status: key });
              this.app.profile.status = key;
              if (key === "invisible") {
                await supabase.from("profiles").update({ is_online: false }).eq("id", this.app.user.id);
                this.app.profile.is_online = false;
              } else {
                await this.setOnline(true);
              }
              toast("Статус: " + meta.label, "success");
              this.app.sounds?.success();
              this.app.closeModal();
              this.renderSidebarFooter();
            } catch (e) { toast(e.message || "Ошибка", "error"); }
          });
          body.appendChild(row);
        });
      },
    });
  }

  /* ---------- Cover picker ---------- */
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
    this.app.openModal({
      title: "Виртуальная обложка",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">Виртуальные обложки. Не требуют загрузки картинки.</p>
          <div class="cover-grid" id="cover-grid"></div>
          <button class="btn btn-ghost btn-block" id="cover-upload" style="margin-top:14px">📷 Загрузить свою</button>
          <button class="btn btn-ghost btn-block" id="cover-clear" style="margin-top:8px">🚫 Убрать обложку</button>`;
        const grid = body.querySelector("#cover-grid");
        presets.forEach((p) => {
          const b = document.createElement("button");
          b.className = p.cls;
          if (this.app.profile.cover_preset === p.id) b.classList.add("selected");
          b.title = p.label;
          b.addEventListener("click", async () => {
            try {
              await this.updateProfile({ cover_preset: p.id, cover_url: null });
              this.app.profile.cover_preset = p.id;
              this.app.profile.cover_url = null;
              toast("Обложка обновлена", "success");
              this.app.sounds?.success();
              this.app.closeModal();
            } catch (e) { toast(e.message || "Ошибка", "error"); }
          });
          grid.appendChild(b);
        });
        body.querySelector("#cover-upload").addEventListener("click", () => {
          this.app.closeModal();
          $("file-cover").click();
        });
        body.querySelector("#cover-clear").addEventListener("click", async () => {
          try {
            await this.updateProfile({ cover_preset: null, cover_url: null });
            this.app.profile.cover_preset = null;
            this.app.profile.cover_url = null;
            toast("Обложка убрана", "warning");
            this.app.closeModal();
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
      },
    });
  }

  /* ---------- About editor ---------- */
  openAboutEditor() {
    this.app.openModal({
      title: "О себе",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <textarea id="about-input" rows="4" maxlength="300" placeholder="Пара слов о себе…">${escapeHtml(this.app.profile.about || "")}</textarea>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="about-cancel">Отмена</button>
            <button class="btn btn-primary" id="about-save">Сохранить</button>
          </div>`;
        body.querySelector("#about-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#about-save").addEventListener("click", async () => {
          const v = body.querySelector("#about-input").value.trim().slice(0, 300);
          try {
            await this.updateProfile({ about: v });
            this.app.profile.about = v;
            toast("Сохранено", "success");
            this.app.sounds?.success();
            this.app.closeModal();
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
      },
    });
  }

  /* ---------- Social links ---------- */
  openSocialLinksEditor() {
    const current = this.app.profile.social_links || {};
    this.app.openModal({
      title: "Соц-ссылки",
      wide: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:14px">Заполни только те поля, которые хочешь показывать публично.</p>
          <div id="sl-fields"></div>
          <div id="sl-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="sl-cancel">Отмена</button>
            <button class="btn btn-primary" id="sl-save">Сохранить</button>
          </div>`;
        const holder = body.querySelector("#sl-fields");
        Object.entries(SOCIAL_META).forEach(([key, meta]) => {
          const row = document.createElement("div");
          row.className = "settings-row";
          row.innerHTML = `<div class="settings-row-info"><div class="settings-row-label">${meta.icon} ${escapeHtml(meta.label)}</div></div>`;
          const inp = document.createElement("input");
          inp.value = current[key] || "";
          inp.placeholder = meta.placeholder;
          inp.style.maxWidth = "280px";
          inp.dataset.key = key;
          row.appendChild(inp);
          holder.appendChild(row);
        });
        body.querySelector("#sl-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#sl-save").addEventListener("click", async () => {
          const errEl = body.querySelector("#sl-error");
          errEl.classList.remove("show");
          const out = {};
          for (const inp of holder.querySelectorAll("input[data-key]")) {
            const v = inp.value.trim();
            if (!v) continue;
            if (!/^https:\/\//i.test(v)) {
              errEl.textContent = "Ссылки должны начинаться с https://";
              errEl.classList.add("show");
              return;
            }
            out[inp.dataset.key] = v;
          }
          try {
            await this.updateProfile({ social_links: out });
            this.app.profile.social_links = out;
            toast("Ссылки сохранены", "success");
            this.app.sounds?.success();
            this.app.closeModal();
          } catch (e) {
            errEl.textContent = e.message || "Ошибка";
            errEl.classList.add("show");
          }
        });
      },
    });
  }

  /* ---------- Upload avatar ---------- */
  async uploadAvatar(file) {
    if (!file.type.startsWith("image/")) throw new Error("Только изображения");
    if (file.size > AVATAR_MAX) throw new Error("Максимум 2 MB");
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${this.app.user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const url = pub.publicUrl + "?t=" + Date.now();
    await this.updateProfile({ avatar_url: url });
    return url;
  }

  /* ---------- Upload cover ---------- */
  async uploadCover(file) {
    if (!file.type.startsWith("image/")) throw new Error("Только изображения");
    if (file.size > COVER_MAX) throw new Error("Максимум 4 MB");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${this.app.user.id}/cover.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const url = pub.publicUrl + "?t=" + Date.now();
    await this.updateProfile({ cover_url: url, cover_preset: null });
    return url;
  }

  /* ---------- Upload badge ---------- */
  async uploadBadge(file) {
    if (!/^image\/(png|gif|webp|jpeg)$/i.test(file.type)) {
      throw new Error("Только PNG/GIF/WebP/JPEG");
    }
    if (file.size > BADGE_MAX) throw new Error("Максимум 1 MB");
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${this.app.user.id}/badge.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BADGE_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(BADGE_BUCKET).getPublicUrl(path);
    const url = pub.publicUrl + "?t=" + Date.now();
    await this.updateProfile({ badge_url: url, badge_emoji: null, badge_anim: null });
    return url;
  }

  /* ---------- Upload notif sound ---------- */
  async uploadNotifSound(file) {
    if (!/^audio\//i.test(file.type)) throw new Error("Только аудио");
    if (file.size > SOUND_MAX) throw new Error("Максимум 1 MB");
    const ext = (file.name.split(".").pop() || "mp3").toLowerCase();
    const path = `${this.app.user.id}/notif.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(SOUND_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(SOUND_BUCKET).getPublicUrl(path);
    const url = pub.publicUrl + "?t=" + Date.now();
    if (this.app.sounds) this.app.sounds.setCustomSound(url);
    return url;
  }

  /* ---------- Profile theme picker ---------- */
  openProfileThemePicker() {
    const themes = Object.entries(PROFILE_THEMES);
    const current = getProfileTheme();
    this.app.openModal({
      title: "Тема профиля",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">Тема применяется ко всему интерфейсу и сохраняется автоматически.</p>
          <div class="theme-grid" id="pt-grid"></div>`;
        const grid = body.querySelector("#pt-grid");
        themes.forEach(([id, th]) => {
          const tile = document.createElement("div");
          tile.className = "theme-tile";
          if (id === current) tile.classList.add("active");
          tile.style.background = th.vars["--bg-1"];
          tile.innerHTML = `<div class="tt-dot" style="background:${th.vars["--accent"]}"></div><div class="tt-body" style="background:${th.vars["--bg-2"]}; color:${th.vars["--text-0"]}">${escapeHtml(th.name)}</div>`;
          tile.addEventListener("click", () => {
            applyProfileTheme(id);
            grid.querySelectorAll(".theme-tile").forEach((x) => x.classList.remove("active"));
            tile.classList.add("active");
            toast("Тема: " + th.name, "success");
            this.app.sounds?.success();
          });
          grid.appendChild(tile);
        });
      },
    });
  }
}