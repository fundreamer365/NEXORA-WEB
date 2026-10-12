/* ============================================================
   NEXORA — js/settings.js
   Настройки, темы чата, все picker'ы, lightbox, комментарии,
   поиск, sessions, TOTP, каталог, emoji packs, bot father,
   ephemeral, local rooms.
   Импортирует: ./supabase.js, ./util.js, ./media.js, ./profile.js
   ============================================================ */

import {
  supabase, STICKER_BUCKET, ATTACH_BUCKET,
  STICKER_MAX, ATTACH_MAX,
  UI_PREFS_KEY, ACCOUNTS_KEY,
} from "./supabase.js";
import {
  $, escapeHtml, safeUrl, toast, formatTime, formatDateTime,
  renderMarkdown, humanSize, lsGet, lsSet, STATUS_META,
} from "./util.js";
import { avatarHTML, buildNameHTML } from "./profile.js";
import { CHAT_THEME_ACCENTS, PROFILE_THEMES,
         applyChatTheme, getProfileTheme, applyProfileTheme } from "../themes.js";

/* ---------- UI Prefs ---------- */
export const MSG_FONTS = {
  default: '"Segoe UI", Roboto, system-ui, sans-serif',
  monospace: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
  serif: 'Georgia, "Times New Roman", serif',
  rounded: '"Comfortaa", "Nunito", "Segoe UI", rounded',
};
export const BUBBLE_COLOR_PRESETS = [
  null,
  "#7c5cff","#4da6ff","#3ddc84","#ff5a6e","#ffb547","#ff6ad5","#5ce1e6",
  "linear-gradient(135deg,#7c5cff,#4d3fbf)",
  "linear-gradient(135deg,#4da6ff,#7c5cff)",
  "linear-gradient(135deg,#3ddc84,#4da6ff)",
  "linear-gradient(135deg,#ff6ad5,#7c5cff)",
];
export const TEXT_EFFECTS = [null, "glow", "rainbow", "shimmer"];
export const BUBBLE_STYLES = ["rounded", "square", "pill", "minimal"];
export const MSG_BACKGROUND_PATTERNS = ["none", "dots", "grid", "stripes", "hearts"];

export function getUiPrefs() {
  return lsGet(UI_PREFS_KEY, {
    chatListMode: "expanded",
    msgFont: "default",
    msgBgPattern: "none",
    bubbleStyle: "rounded",
  });
}
export function setUiPref(key, value) {
  const prefs = getUiPrefs();
  prefs[key] = value;
  lsSet(UI_PREFS_KEY, prefs);
}

/* ---------- Bot commands ---------- */
export const BOT_COMMANDS = {
  "/help": "Доступные команды:\n/newbot — создать своего бота\n/mybots — список моих ботов\n/time — текущее время\n/roll 6 — случайное число\n/echo текст — вернуть текст\n/ping — pong",
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
   SettingsService
   ============================================================ */
export class SettingsService {
  constructor(app) {
    this.app = app;
  }

  /* ============================================================
     UI PREFS APPLY
     ============================================================ */
  applyUiPrefs() {
    const prefs = getUiPrefs();
    const list = $("sidebar-list");
    if (list) list.classList.toggle("compact", prefs.chatListMode === "compact");
    document.documentElement.style.setProperty(
      "--msg-font",
      MSG_FONTS[prefs.msgFont] || MSG_FONTS.default
    );
    const box = $("messages");
    if (box) {
      box.classList.remove(
        "messages-bg-dots","messages-bg-grid",
        "messages-bg-stripes","messages-bg-hearts"
      );
      if (prefs.msgBgPattern && prefs.msgBgPattern !== "none") {
        box.classList.add("messages-bg-" + prefs.msgBgPattern);
      }
      box.classList.remove("bubbles-square", "bubbles-minimal");
      if (prefs.bubbleStyle === "square") box.classList.add("bubbles-square");
      if (prefs.bubbleStyle === "minimal") box.classList.add("bubbles-minimal");
    }
  }

  saveUiPref(key, value) {
    setUiPref(key, value);
    this.applyUiPrefs();
  }

  /* ============================================================
     CHAT THEMES
     ============================================================ */
  openChatThemePicker(chat) {
    const themes = Object.entries(CHAT_THEME_ACCENTS);
    this.app.openModal({
      title: "Тема чата",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">Акцент темы применяется только в этом чате и только для тебя.</p>
          <div class="theme-grid" id="chat-theme-grid"></div>`;
        const grid = body.querySelector("#chat-theme-grid");
        const currentAccent = this.app.theme[chat.id]?.accent || null;
        themes.forEach(([key, info]) => {
          const tile = document.createElement("div");
          tile.className = "theme-tile";
          const c = info.accent || "#7c5cff";
          tile.style.background = "#16161f";
          tile.innerHTML = `<div class="tt-dot" style="background:${c}"></div><div class="tt-body" style="background:${c}">${escapeHtml(info.name)}</div>`;
          if ((currentAccent || null) === info.accent) tile.classList.add("active");
          tile.addEventListener("click", async () => {
            await this.saveChatTheme(chat.id, info.accent, this.app.theme[chat.id]?.wallpaper_url || null);
            grid.querySelectorAll(".theme-tile").forEach((x) => x.classList.remove("active"));
            tile.classList.add("active");
            toast("Тема чата обновлена", "success");
            this.app.sounds?.success();
          });
          grid.appendChild(tile);
        });

        // Wallpaper
        const wallSec = document.createElement("div");
        wallSec.className = "settings-section";
        wallSec.style.marginTop = "14px";
        wallSec.innerHTML = `<h3>Обои</h3>`;
        const wallInp = document.createElement("input");
        wallInp.placeholder = "https://example.com/wallpaper.jpg";
        wallInp.value = this.app.theme[chat.id]?.wallpaper_url || "";
        const wallSave = document.createElement("button");
        wallSave.className = "btn btn-primary";
        wallSave.style.marginTop = "8px";
        wallSave.textContent = "Применить обои";
        wallSave.addEventListener("click", async () => {
          const u = wallInp.value.trim();
          if (u && !safeUrl(u)) return toast("Ссылка должна начинаться с http(s)://", "warning");
          await this.saveChatTheme(chat.id, currentAccent, u || null);
          toast("Обои сохранены", "success");
          this.app.sounds?.success();
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
        user_id: this.app.user.id,
        chat_id: chatId,
        accent,
        wallpaper_url: wallpaper,
      });
      if (!this.app.theme[chatId]) this.app.theme[chatId] = {};
      this.app.theme[chatId].accent = accent;
      this.app.theme[chatId].wallpaper_url = wallpaper;
      if (this.app.activeChat?.id === chatId) this.applyChatThemeToUI(chatId);
    } catch (e) { toast(e.message || "Ошибка", "error"); }
  }

  async loadChatThemes(force = false) {
    if (!force && this.app._themeLoadedFor === this.app.user.id) return;
    try {
      const { data } = await supabase.from("chat_themes")
        .select("*").eq("user_id", this.app.user.id);
      const map = {};
      (data || []).forEach((t) => {
        map[t.chat_id] = { accent: t.accent, wallpaper_url: t.wallpaper_url };
      });
      this.app.theme = map;
      this.app._themeLoadedFor = this.app.user.id;
    } catch (_) {}
  }

  applyChatThemeToUI(chatId) {
    const t = this.app.theme[chatId];
    const box = $("messages");
    if (!box) return;
    if (t?.wallpaper_url) {
      box.style.backgroundImage = `url('${safeUrl(t.wallpaper_url)}')`;
      box.style.backgroundSize = "cover";
      box.style.backgroundPosition = "center";
    } else {
      box.style.backgroundImage = "";
    }
    applyChatTheme(t || null);
  }

  /* ============================================================
     REPLY / LIGHTBOX / SEARCH
     ============================================================ */
  setReplyTo(msg) {
    this.app.pendingReplyTo = msg;
    const sender = this.app.members.find((x) => x.user_id === msg.sender_id);
    const name = msg.sender_id === this.app.user.id ? "Ты" : (sender?.username || "User");
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
    this.app.pendingReplyTo = null;
    const bar = $("reply-bar");
    if (bar) {
      bar.classList.add("hidden");
      bar.innerHTML = "";
    }
  }

  openLightbox(url, kind) {
    const lb = document.createElement("div");
    lb.className = "lightbox";
    let node;
    if (kind === "video") {
      node = document.createElement("video");
      node.src = url;
      node.controls = true;
      node.autoplay = true;
    } else {
      node = document.createElement("img");
      node.src = url;
    }
    lb.appendChild(node);
    lb.addEventListener("click", () => lb.remove());
    document.body.appendChild(lb);
  }

  /* ============================================================
     COMMENTS
     ============================================================ */
  openCommentsFor(msg) {
    this.app.openModal({
      title: "Комментарии",
      body: async (body) => {
        body.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
        let comments = [];
        try {
          const { data } = await supabase.from("messages")
            .select("id, sender_id, content, created_at, deleted_at")
            .eq("channel_post_id", msg.id)
            .order("created_at", { ascending: true })
            .limit(200);
          comments = data || [];
        } catch (_) {}

        const renderComments = (list) => {
          body.innerHTML = "";
          if (!list.length) {
            body.innerHTML = `<p class="muted">Комментариев пока нет. Будь первым!</p>`;
          } else {
            list.forEach((c) => {
              const sender = this.app.members.find((x) => x.user_id === c.sender_id);
              const name = c.sender_id === this.app.user.id
                ? "Ты" : (sender?.username || "User");
              const row = document.createElement("div");
              row.className = "comment-row";
              if (c.deleted_at) row.classList.add("deleted");
              row.innerHTML = `
                <div class="comment-author">${escapeHtml(name)}<span class="comment-time">${escapeHtml(formatTime(c.created_at))}</span></div>
                <div class="comment-body">${c.deleted_at ? '<em style="opacity:.6">Сообщение удалено</em>' : renderMarkdown(c.content)}</div>`;
              body.appendChild(row);
            });
          }
        };
        renderComments(comments);

        const input = document.createElement("input");
        input.placeholder = "Написать комментарий…";
        input.style.marginTop = "14px";
        const send = document.createElement("button");
        send.className = "btn btn-primary";
        send.textContent = "Отправить";
        send.style.marginTop = "8px";
        send.style.width = "100%";
        send.addEventListener("click", async () => {
          const text = input.value.trim();
          if (!text) return;
          try {
            const { data, error } = await supabase.from("messages").insert({
              chat_id: this.app.activeChat.id,
              sender_id: this.app.user.id,
              content: text,
              kind: "text",
              channel_post_id: msg.id,
            }).select().single();
            if (error) throw error;
            input.value = "";
            toast("Комментарий добавлен", "success");
            comments.push(data);
            renderComments(comments);
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
        body.appendChild(input);
        body.appendChild(send);

        const ch = supabase.channel("comments:" + msg.id)
          .on("postgres_changes",
            { event: "*", schema: "public", table: "messages", filter: `channel_post_id=eq.${msg.id}` },
            async () => {
              try {
                const { data } = await supabase.from("messages")
                  .select("id, sender_id, content, created_at, deleted_at")
                  .eq("channel_post_id", msg.id)
                  .order("created_at", { ascending: true })
                  .limit(200);
                comments = data || [];
                renderComments(comments);
              } catch (_) {}
            })
          .subscribe();
        const origClose = this.app.closeModal.bind(this.app);
        this.app.closeModal = () => {
          try { supabase.removeChannel(ch); } catch (_) {}
          this.app.closeModal = origClose;
          origClose();
        };
      },
    });
  }

  /* ============================================================
     SEARCH IN CHAT / GLOBAL SEARCH
     ============================================================ */
  openSearchInChat() {
    if (!this.app.activeChat) return;
    const qField = document.createElement("input");
    qField.placeholder = "Найти…";
    qField.style.cssText = "padding:10px 14px;font-size:14px";

    const dlg = this.app.openModal({
      title: "Поиск в чате",
      narrow: true,
      body: (body) => {
        body.innerHTML = "";
        body.appendChild(qField);
      },
      footer: (footerEl) => {
        const cancel = document.createElement("button");
        cancel.className = "btn btn-ghost";
        cancel.textContent = "Отмена";
        cancel.addEventListener("click", () => this.app.closeModal());
        const find = document.createElement("button");
        find.className = "btn btn-primary";
        find.textContent = "Найти";
        find.addEventListener("click", () => {
          const q = (qField.value || "").toLowerCase().trim();
          if (!q) return;
          const found = this.app.messages.find((m) => (m.content || "").toLowerCase().includes(q));
          if (!found) { toast("Не найдено", "warning"); return; }
          this.app.closeModal();
          setTimeout(() => {
            const el = document.querySelector(`[data-message-id="${found.id}"]`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("msg-link-highlight");
              setTimeout(() => el.classList.remove("msg-link-highlight"), 2500);
            }
          }, 200);
        });
        footerEl.appendChild(cancel);
        footerEl.appendChild(find);
      },
    });
    setTimeout(() => qField.focus(), 100);
  }

  async globalMessageSearch(q) {
    if (!q) return;
    try {
      const { data, error } = await supabase.from("messages")
        .select("id, chat_id, sender_id, content, created_at")
        .textSearch("search_tsv", q, { type: "plain" })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      this.app.openModal({
        title: "Поиск по сообщениям",
        wide: true,
        body: (body) => {
          body.innerHTML = `<h4 style="color:var(--text-2);margin-bottom:12px">Найдено: ${data?.length || 0}</h4>`;
          (data || []).forEach((m) => {
            const row = document.createElement("div");
            row.className = "settings-row";
            row.style.cursor = "pointer";
            row.innerHTML = `<div class="settings-row-info"><div class="settings-row-label">${escapeHtml((m.content || "").slice(0, 100))}</div><div class="settings-row-desc">${escapeHtml(formatTime(m.created_at))}</div></div>`;
            row.addEventListener("click", () => {
              this.app.closeModal();
              this.app.chatService.openChatById(m.chat_id);
            });
            body.appendChild(row);
          });
        },
      });
    } catch (e) { toast("Ошибка поиска", "error"); }
  }

  /* ============================================================
     SESSIONS / TOTP
     ============================================================ */
  async openSessionsDialog() {
    let sessions = [];
    try {
      const { data, error } = await supabase.rpc("list_my_sessions");
      if (!error && data) sessions = data;
    } catch (_) {}
    this.app.openModal({
      title: "Активные сессии",
      body: (body) => {
        body.innerHTML = "";
        if (!sessions.length) {
          body.innerHTML = `<p class="muted">Нет данных о сессиях.</p>`;
        } else {
          sessions.forEach((s) => {
            const row = document.createElement("div");
            row.className = "session-row";
            row.innerHTML = `<div class="session-info"><div class="session-ua">${escapeHtml(s.user_agent || "Unknown device")}</div><div class="session-date">Последняя активность: ${escapeHtml(formatDateTime(s.updated_at))}</div></div>`;
            body.appendChild(row);
          });
        }
        const note = document.createElement("p");
        note.style.cssText = "color:var(--text-3);font-size:12px;margin-top:14px";
        note.textContent = "«Выйти везде» завершит все сеансы, кроме текущего.";
        body.appendChild(note);
      },
      footer: (footerEl) => {
        const close = document.createElement("button");
        close.className = "btn btn-ghost";
        close.textContent = "Закрыть";
        close.addEventListener("click", () => this.app.closeModal());
        const revoke = document.createElement("button");
        revoke.className = "btn btn-danger";
        revoke.textContent = "Выйти везде";
        revoke.addEventListener("click", async () => {
          if (!confirm("Завершить все сессии?")) return;
          try {
            const { error } = await supabase.rpc("revoke_all_sessions", { keep_token: null });
            if (error) throw error;
            toast("Все сессии завершены", "success");
            this.app.sounds?.success();
            this.app.closeModal();
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
        footerEl.appendChild(close);
        footerEl.appendChild(revoke);
      },
    });
  }

  openTotpModal(enroll) {
    this.app.openModal({
      title: "Включение 2FA",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">Отсканируй QR в Google Authenticator.</p>
          <div id="qr-holder" style="background:#fff;padding:12px;border-radius:10px;text-align:center"></div>
          <p style="font-size:12px;color:var(--text-3);margin:12px 0 6px">Секрет:</p>
          <code style="background:var(--bg-2);padding:8px 12px;border-radius:6px;font-size:12px;display:block;word-break:break-all">${escapeHtml(enroll.totp.secret)}</code>
          <input id="totp-code" class="mfa-input" maxlength="6" inputmode="numeric" placeholder="000000" style="margin-top:14px">
          <div id="totp-error" class="form-error" style="margin-top:10px"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="totp-cancel">Отмена</button>
            <button class="btn btn-primary" id="totp-verify">Проверить</button>
          </div>`;
        const holder = body.querySelector("#qr-holder");
        const qr = enroll.totp.qr_code;
        if (typeof qr === "string" && qr.startsWith("data:")) {
          const img = document.createElement("img");
          img.src = qr;
          img.style.maxWidth = "200px";
          holder.appendChild(img);
        } else if (typeof qr === "string" && qr.startsWith("<svg")) {
          holder.innerHTML = qr;
        } else {
          holder.textContent = "QR недоступен, используй секрет";
        }
        body.querySelector("#totp-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#totp-verify").addEventListener("click", async () => {
          const code = body.querySelector("#totp-code").value.trim();
          const errEl = body.querySelector("#totp-error");
          errEl.classList.remove("show");
          if (!/^\d{6}$/.test(code)) {
            errEl.textContent = "Введи 6 цифр";
            errEl.classList.add("show");
            return;
          }
          try {
            const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({
              factorId: enroll.id,
            });
            if (cErr) throw cErr;
            const { error } = await supabase.auth.mfa.verify({
              factorId: enroll.id,
              challengeId: ch.id,
              code,
            });
            if (error) throw error;
            toast("2FA включена", "success");
            this.app.sounds?.success();
            this.app.closeModal();
          } catch (e) {
            errEl.textContent = e.message || "Неверный код";
            errEl.classList.add("show");
          }
        });
      },
    });
  }

  /* ============================================================
     LANGUAGE
     ============================================================ */
  openLanguageDialog() {
    this.app.openModal({
      title: "Язык",
      narrow: true,
      body: (body) => {
        body.innerHTML = `<div class="language-grid" id="lang-grid"></div>`;
        const grid = body.querySelector("#lang-grid");
        const cur = this.app.currentLocaleFn?.() || "ru";
        const LOCALES = this.app.LOCALES || {};
        Object.entries(LOCALES).forEach(([code, name]) => {
          const b = document.createElement("button");
          b.textContent = name;
          if (code === cur) b.classList.add("active");
          b.addEventListener("click", () => {
            this.app.setLocaleFn?.(code);
            this.app.applyTranslationsFn?.();
            grid.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
            b.classList.add("active");
            toast("Language: " + name, "success");
            this.app.sounds?.success();
          });
          grid.appendChild(b);
        });
      },
    });
  }

  /* ============================================================
     ACTIVITY / EPHEMERAL / LOCAL ROOMS
     ============================================================ */
  openActivityDialog() {
    this.app.openModal({
      title: "Активность",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">Короткий текст рядом с твоим именем.</p>
          <input id="act-input" maxlength="60" value="${escapeHtml(this.app.profile.activity_text || "")}" placeholder="💻 работаю над кодом">
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="act-cancel">Отмена</button>
            <button class="btn btn-primary" id="act-save">Сохранить</button>
          </div>`;
        body.querySelector("#act-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#act-save").addEventListener("click", async () => {
          const text = body.querySelector("#act-input").value.trim().slice(0, 60);
          try {
            await this.app.profileService.updateProfile({ activity_text: text });
            this.app.profile.activity_text = text;
            toast("Активность обновлена", "success");
            this.app.sounds?.success();
            this.app.closeModal();
          } catch (e) { toast(e.message || "Ошибка", "error"); }
        });
      },
    });
  }

  openEphemeralDialog() {
    this.app.openModal({
      title: "Исчезающий чат",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">Чат и все его сообщения удалятся через указанное время.</p>
          <div class="form-group"><label>Название</label><input id="eph-title" maxlength="60" placeholder="Секретный чат"></div>
          <div class="form-group"><label>Время жизни (мин)</label><input id="eph-ttl" type="number" min="5" max="10080" value="60"></div>
          <div id="eph-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="eph-cancel">Отмена</button>
            <button class="btn btn-primary" id="eph-create">Создать</button>
          </div>`;
        body.querySelector("#eph-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#eph-create").addEventListener("click", async () => {
          const title = body.querySelector("#eph-title").value.trim();
          const ttl = parseInt(body.querySelector("#eph-ttl").value, 10);
          const errEl = body.querySelector("#eph-error");
          errEl.classList.remove("show");
          if (!ttl || ttl < 5) {
            errEl.textContent = "Минимум 5 минут";
            errEl.classList.add("show");
            return;
          }
          try {
            const { data, error } = await supabase.rpc("create_ephemeral_chat", {
              p_title: title || "Исчезающий чат",
              p_ttl_minutes: ttl,
            });
            if (error) throw error;
            toast("Исчезающий чат создан", "success");
            this.app.sounds?.success();
            this.app.closeModal();
            await this.app.chatService.refreshChats();
            await this.app.chatService.openChatById(data);
          } catch (e) {
            errEl.textContent = e.message || "Ошибка";
            errEl.classList.add("show");
          }
        });
      },
    });
  }

  async openLocalRoomsDialog() {
    if (!navigator.geolocation) {
      return toast("Геолокация не поддерживается", "error");
    }
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

        this.app.openModal({
          title: "Локальные комнаты",
          body: (body) => {
            body.innerHTML = `
              <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">Комнаты рядом с вами.</p>
              <div style="display:flex;gap:8px;margin-bottom:14px">
                <button class="btn btn-primary" id="lr-create-btn" style="flex:1">📍 Создать</button>
                <button class="btn btn-ghost" id="lr-refresh-btn">🔄</button>
              </div>
              <div id="lr-list"></div>`;
            const list = body.querySelector("#lr-list");
            if (!rooms.length) {
              list.innerHTML = `<div class="empty-state">Рядом пока никого.</div>`;
            } else {
              rooms.forEach((r) => {
                const card = document.createElement("div");
                card.className = "local-room-card";
                card.innerHTML = `<div class="local-room-icon">📍</div><div class="local-room-body"><div class="local-room-title">${escapeHtml(r.name)}</div><div class="local-room-meta">${Math.round(r.distance_m)} м · ${r.members_count} участников</div></div>`;
                card.addEventListener("click", async () => {
                  try {
                    await supabase.rpc("join_local_room", { p_chat_id: r.chat_id });
                  } catch (_) {}
                  this.app.closeModal();
                  await this.app.chatService.refreshChats();
                  await this.app.chatService.openChatById(r.chat_id);
                });
                list.appendChild(card);
              });
            }
            body.querySelector("#lr-create-btn").addEventListener("click", () => {
              this.app.closeModal();
              setTimeout(() => this.openCreateLocalRoomDialog(lat, lng), 100);
            });
            body.querySelector("#lr-refresh-btn").addEventListener("click", () => {
              this.app.closeModal();
              setTimeout(() => this.openLocalRoomsDialog(), 100);
            });
          },
        });
      },
      () => toast("Не удалось определить местоположение", "error")
    );
  }

  openCreateLocalRoomDialog(lat, lng) {
    this.app.openModal({
      title: "Локальная комната",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <div class="form-group"><label>Название</label><input id="lr-name" maxlength="60" placeholder="Концерт, Кафе"></div>
          <div class="form-group"><label>Радиус (м)</label><input id="lr-radius" type="number" min="50" max="5000" value="500"></div>
          <div class="form-group"><label>Время жизни (мин)</label><input id="lr-ttl" type="number" min="5" max="1440" value="120"></div>
          <div id="lr-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="lr-cancel">Отмена</button>
            <button class="btn btn-primary" id="lr-create">Создать</button>
          </div>`;
        body.querySelector("#lr-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#lr-create").addEventListener("click", async () => {
          const name = body.querySelector("#lr-name").value.trim();
          const radius = parseInt(body.querySelector("#lr-radius").value, 10);
          const ttl = parseInt(body.querySelector("#lr-ttl").value, 10);
          const errEl = body.querySelector("#lr-error");
          errEl.classList.remove("show");
          if (!name) {
            errEl.textContent = "Введи название";
            errEl.classList.add("show");
            return;
          }
          try {
            const { data, error } = await supabase.rpc("create_local_room", {
              p_name: name, p_lat: lat, p_lng: lng,
              p_radius_m: radius, p_ttl_minutes: ttl,
            });
            if (error) throw error;
            const { data: roomRow } = await supabase.from("local_rooms")
              .select("chat_id").eq("id", data).single();
            if (roomRow) {
              try {
                await supabase.rpc("join_local_room", { p_chat_id: roomRow.chat_id });
              } catch (_) {}
              this.app.closeModal();
              await this.app.chatService.refreshChats();
              await this.app.chatService.openChatById(roomRow.chat_id);
            }
            toast("Локальная комната создана", "success");
            this.app.sounds?.success();
          } catch (e) {
            errEl.textContent = e.message || "Ошибка";
            errEl.classList.add("show");
          }
        });
      },
    });
  }

  /* ============================================================
     CATALOG / EMOJI PACKS / BOT FATHER
     ============================================================ */
  async openChannelCatalog() {
    let channels = [];
    try {
      const { data } = await supabase.from("chats")
        .select("id, title, description, avatar_url, username, is_public")
        .eq("type", "channel").eq("is_public", true)
        .not("username", "is", null)
        .order("updated_at", { ascending: false })
        .limit(100);
      channels = data || [];
    } catch (_) {}
    this.app.openModal({
      title: "Каталог каналов",
      wide: true,
      body: (body) => {
        if (!channels.length) {
          body.innerHTML = `<div class="empty-state">Пока нет публичных каналов.</div>`;
          return;
        }
        body.innerHTML = "";
        channels.forEach((c) => {
          const card = document.createElement("div");
          card.className = "catalog-card";
          card.innerHTML = `<div class="catalog-avatar">#</div><div class="catalog-body"><div class="catalog-title">${escapeHtml(c.title || "")} <span class="channel-badge public">public</span></div><div class="catalog-meta">@${escapeHtml(c.username)} · ${escapeHtml((c.description || "").slice(0, 60))}</div></div>`;
          card.addEventListener("click", async () => {
            this.app.closeModal();
            await this.app.searchChannel(c.username);
          });
          body.appendChild(card);
        });
      },
    });
  }

  async openEmojiPacksManager() {
    let packs = [];
    try {
      const { data } = await supabase.from("emoji_packs")
        .select("id, name, is_public, created_at")
        .eq("owner_id", this.app.user.id)
        .order("created_at", { ascending: false });
      packs = data || [];
    } catch (_) {}
    this.app.openModal({
      title: "Эмодзи-паки",
      wide: true,
      body: (body) => {
        body.innerHTML = `
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">Создавай свои эмодзи. В сообщениях работают как :shortcode:</p>
          <button class="btn btn-primary btn-block" id="ep-new" style="margin-bottom:14px">＋ Создать пак</button>
          <div id="ep-list"></div>`;
        const list = body.querySelector("#ep-list");
        if (!packs.length) {
          list.innerHTML = `<div class="empty-state">Пока нет паков.</div>`;
        } else {
          packs.forEach((p) => {
            const row = document.createElement("div");
            row.className = "settings-row";
            row.innerHTML = `<div class="settings-row-info"><div class="settings-row-label">${escapeHtml(p.name)}</div><div class="settings-row-desc">${p.is_public ? "публичный" : "приватный"}</div></div>`;
            const openBtn = document.createElement("button");
            openBtn.className = "btn btn-ghost";
            openBtn.textContent = "Открыть";
            openBtn.addEventListener("click", () => {
              this.app.closeModal();
              setTimeout(() => this.openPackEditor(p), 100);
            });
            row.appendChild(openBtn);
            list.appendChild(row);
          });
        }
        body.querySelector("#ep-new").addEventListener("click", () => {
          this.app.closeModal();
          setTimeout(() => this.openCreatePackDialog(), 100);
        });
      },
    });
  }

  openCreatePackDialog() {
    this.app.openModal({
      title: "Создать пак",
      narrow: true,
      body: (body) => {
        body.innerHTML = `
          <div class="form-group"><label>Название пака</label><input id="ep-name" maxlength="40" placeholder="Мои коты"></div>
          <label style="display:flex;gap:10px;align-items:center;cursor:pointer;padding:6px 0"><input type="checkbox" id="ep-public" style="width:auto" checked><span>Публичный пак</span></label>
          <div id="ep-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="ep-cancel">Отмена</button>
            <button class="btn btn-primary" id="ep-create">Создать</button>
          </div>`;
        body.querySelector("#ep-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#ep-create").addEventListener("click", async () => {
          const name = body.querySelector("#ep-name").value.trim();
          const isPublic = body.querySelector("#ep-public").checked;
          const errEl = body.querySelector("#ep-error");
          errEl.classList.remove("show");
          if (!name) {
            errEl.textContent = "Введи название";
            errEl.classList.add("show");
            return;
          }
          try {
            const { data, error } = await supabase.from("emoji_packs")
              .insert({ owner_id: this.app.user.id, name, is_public: isPublic })
              .select().single();
            if (error) throw error;
            toast("Пак создан", "success");
            this.app.sounds?.success();
            this.app.closeModal();
            setTimeout(() => this.openPackEditor(data), 100);
          } catch (e) {
            errEl.textContent = e.message || "Ошибка";
            errEl.classList.add("show");
          }
        });
      },
    });
  }

  async openPackEditor(pack) {
    let emojis = [];
    try {
      const { data } = await supabase.from("custom_emojis")
        .select("id, shortcode, url")
        .eq("pack_id", pack.id)
        .order("created_at", { ascending: true });
      emojis = data || [];
    } catch (_) {}
    this.app.openModal({
      title: `Пак: ${pack.name}`,
      wide: true,
      body: (body) => {
        body.innerHTML = `
          <div style="display:flex;gap:8px;margin-bottom:14px">
            <button class="btn btn-primary" id="ce-add">＋ Загрузить эмодзи</button>
          </div>
          <div id="ce-list" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px"></div>`;
        const list = body.querySelector("#ce-list");
        const renderList = (items) => {
          list.innerHTML = "";
          if (!items.length) {
            list.innerHTML = `<div class="empty-state" style="grid-column:1/-1">Пак пуст.</div>`;
            return;
          }
          items.forEach((e) => {
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
              emojis = emojis.filter((x) => x.id !== e.id);
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
            const shortcode = (prompt(
              "Короткий код:",
              f.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "")
            ) || "").trim();
            if (!shortcode) return;
            try {
              const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(0, 60);
              const path = `${this.app.user.id}/emoji-${pack.id}-${Date.now()}-${safe}`;
              const { error: upErr } = await supabase.storage
                .from(STICKER_BUCKET)
                .upload(path, f, { contentType: f.type, upsert: false });
              if (upErr) throw upErr;
              const { data: pub } = supabase.storage.from(STICKER_BUCKET).getPublicUrl(path);
              const { data: row, error } = await supabase.from("custom_emojis")
                .insert({ pack_id: pack.id, shortcode, url: pub.publicUrl })
                .select().single();
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

  openBotFather() {
    this.app.openModal({
      title: "Создание бота",
      body: (body) => {
        body.innerHTML = `
          <div class="form-group"><label>Username (латиница, 3–24)</label><input id="bf-username" maxlength="24" placeholder="MyCoolBot"></div>
          <div class="form-group"><label>Отображаемое имя</label><input id="bf-name" maxlength="40" placeholder="My Cool Bot"></div>
          <div class="form-group"><label>Описание</label><input id="bf-desc" maxlength="200" placeholder="Что делает бот"></div>
          <div class="form-group"><label>Команды (по одной на строку)</label><textarea id="bf-commands" rows="5" placeholder="/start Привет!\n/help Помощь"></textarea></div>
          <div id="bf-error" class="form-error"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" id="bf-cancel">Отмена</button>
            <button class="btn btn-primary" id="bf-create">Создать бота</button>
          </div>`;
        body.querySelector("#bf-cancel").addEventListener("click", () => this.app.closeModal());
        body.querySelector("#bf-create").addEventListener("click", async () => {
          const username = body.querySelector("#bf-username").value.trim();
          const name = body.querySelector("#bf-name").value.trim();
          const desc = body.querySelector("#bf-desc").value.trim();
          const commandsRaw = body.querySelector("#bf-commands").value;
          const errEl = body.querySelector("#bf-error");
          errEl.classList.remove("show");
          if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
            errEl.textContent = "Username: 3–24, латиница/цифры/_";
            errEl.classList.add("show");
            return;
          }
          const commands = commandsRaw.split("\n")
            .map((l) => l.trim()).filter(Boolean)
            .map((line) => {
              const m = line.match(/^(\S+)\s+(.*)$/);
              if (m) return { cmd: m[1], reply: m[2] };
              return { cmd: line, reply: "(нет ответа)" };
            });
          try {
            const { data, error } = await supabase.rpc("create_custom_bot", {
              p_username: username,
              p_display_name: name || username,
              p_description: desc,
              p_commands: commands,
            });
            if (error) throw error;
            toast("Бот создан", "success");
            this.app.sounds?.success();
            this.app.closeModal();
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
        .eq("owner_id", this.app.user.id)
        .order("created_at", { ascending: false });
      this.app.openModal({
        title: "Мои боты",
        body: (body) => {
          if (!data?.length) {
            body.innerHTML = `<p class="muted">У тебя пока нет ботов</p>`;
            return;
          }
          data.forEach((b) => {
            const row = document.createElement("div");
            row.className = "settings-row";
            row.innerHTML = `<div class="settings-row-info"><div class="settings-row-label">${escapeHtml(b.display_name)} <span class="bot-badge">[BOT]</span></div><div class="settings-row-desc">@${escapeHtml(b.username)} · ${(b.commands || []).length} команд</div></div>`;
            const open = document.createElement("button");
            open.className = "btn btn-ghost";
            open.textContent = "Открыть";
            open.addEventListener("click", () => {
              this.app.closeModal();
              this.openBotChatById(b.bot_user_id);
            });
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
      await this.app.chatService.refreshChats();
      const chat = this.app.chats.find((c) => c.id === res.data);
      if (chat) this.app.chatService.openChat(chat);
    } catch (e) { toast("Не удалось открыть чат с ботом", "error"); }
  }

  /* ============================================================
     BOT REPLIES (из chat.js)
     ============================================================ */
  maybeBotReply(msg) {
    if (!this.app.activeChat?.peer?.is_bot) return;
    if (msg.sender_id !== this.app.user.id) return;
    const text = (msg.content || "").trim();
    if (!text.startsWith("/")) return;
    const [cmd, ...args] = text.split(/\s+/);
    const key = cmd.toLowerCase();

    if (key === "/newbot") {
      this.deliverBotReply("Открываю мастер создания бота…");
      setTimeout(() => this.openBotFather(), 300);
      return;
    }
    if (key === "/mybots") {
      this.deliverBotReply("Открываю список ботов…");
      setTimeout(() => this.openMyBots(), 300);
      return;
    }
    const builtin = BOT_COMMANDS[key];
    if (builtin) {
      const reply = typeof builtin === "function" ? builtin(args) : builtin;
      this.deliverBotReply(reply);
      return;
    }
    if (Array.isArray(this.app._activeBotCommands)) {
      const custom = this.app._activeBotCommands.find(
        (c) => (c.cmd || "").toLowerCase() === key
      );
      if (custom) {
        this.deliverBotReply(custom.reply || "");
        return;
      }
    }
  }

  async deliverBotReply(text) {
    if (!this.app.activeChat) return;
    try {
      const { error } = await supabase.rpc("bot_reply", {
        p_chat_id: this.app.activeChat.id,
        p_content: text,
      });
      if (error) throw error;
    } catch (e) { console.error("bot_reply:", e); }
  }

  /* ============================================================
     FILE PICKER
     ============================================================ */
  async pickAttachment() {
    if (!this.app.activeChat) return;
    const input = $("file-attach");
    input.value = "";
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > ATTACH_MAX) return toast("Файл больше 50 MB", "warning");
      try {
        toast("Загрузка…", "info");
        const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
        const path = `${this.app.user.id}/${this.app.activeChat.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(ATTACH_BUCKET)
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(ATTACH_BUCKET).getPublicUrl(path);
        let kind = "file";
        if (file.type.startsWith("image/")) kind = "image";
        else if (file.type.startsWith("video/")) kind = "video";
        this.app.pendingAttachment = {
          url: pub.publicUrl, kind, name: file.name, size: file.size,
        };
        $("attach-label").textContent = `📎 ${file.name} (${humanSize(file.size)}) — Enter для отправки`;
        $("attach-bar").classList.remove("hidden");
        toast("Готово", "success");
        this.app.sounds?.click();
      } catch (e) { toast("Не удалось загрузить", "error"); }
    };
    input.click();
  }

  hideAttachBar() {
    this.app.pendingAttachment = null;
    $("attach-bar").classList.add("hidden");
    $("attach-label").textContent = "";
  }

  /* ============================================================
     VOICE RECORDING
     ============================================================ */
  async toggleVoiceRecording() {
    if (this.app._recorder && this.app._recorder.state === "recording") {
      return this.stopVoiceRecording();
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      return toast("Запись голоса не поддерживается", "error");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.app._recorder = new MediaRecorder(stream);
      this.app._chunks = [];
      this.app._recorder.ondataavailable = (e) => {
        if (e.data.size) this.app._chunks.push(e.data);
      };
      this.app._recorder.onstop = () => this._finishVoiceRecording();
      this.app._recorder.start();
      this.app._recStartAt = Date.now();

      const bar = $("voice-bar");
      if (bar) {
        bar.classList.remove("hidden");
        bar.querySelector(".voice-time").textContent = "0:00";
      }
      this.app._voiceTimer = setInterval(() => {
        const sec = Math.floor((Date.now() - this.app._recStartAt) / 1000);
        const mm = Math.floor(sec / 60);
        const ss = String(sec % 60).padStart(2, "0");
        const b2 = $("voice-bar");
        if (b2) b2.querySelector(".voice-time").textContent = `${mm}:${ss}`;
      }, 250);
    } catch (e) { toast("Нет доступа к микрофону", "error"); }
  }

  stopVoiceRecording() {
    if (!this.app._recorder) return;
    try { this.app._recorder.stop(); } catch (_) {}
    if (this.app._voiceTimer) {
      clearInterval(this.app._voiceTimer);
      this.app._voiceTimer = null;
    }
    const bar = $("voice-bar");
    if (bar) bar.classList.add("hidden");
  }

  async _finishVoiceRecording() {
    const chunks = this.app._chunks || [];
    this.app._chunks = [];
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: "audio/webm" });
    const buffer = await blob.arrayBuffer();
    try {
      const path = `${this.app.user.id}/${this.app.activeChat.id}/${Date.now()}-voice.webm`;
      const { error: upErr } = await supabase.storage
        .from(ATTACH_BUCKET)
        .upload(path, buffer, { contentType: "audio/webm", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(ATTACH_BUCKET).getPublicUrl(path);
      const payload = {
        chat_id: this.app.activeChat.id,
        sender_id: this.app.user.id,
        content: "[голосовое]",
        kind: "voice",
        attachment_url: pub.publicUrl,
        attachment_type: "voice",
        file_name: "voice.webm",
        file_size: blob.size,
      };
      const { data, error } = await supabase.from("messages").insert(payload).select().single();
      if (error) throw error;
      if (!this.app.messages.find((m) => m.id === data.id)) {
        this.app.messages.push(data);
        this.app.chatService.paintMessageWindow();
      }
      this.app.sounds?.send();
      toast("Голосовое отправлено", "success");
    } catch (e) { toast("Ошибка голосового: " + (e.message || ""), "error"); }
  }
}
