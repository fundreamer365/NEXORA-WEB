/* ============================================================
   NEXORA — js/auth.js
   Авторизация, регистрация, 2FA, logout, переключение аккаунтов.
   Импортирует: ./supabase.js, ./util.js
   Экспортирует:
     - class AuthService (методы через инстанс NEXORA)
     - emailFromUsername, validateUsername
   ============================================================ */

import { supabase, VIRTUAL_DOMAIN, ACCOUNTS_KEY } from "./supabase.js";
import { $, toast, lsGet, lsSet } from "./util.js";

/* ---------- Вспомогательные ---------- */
export function emailFromUsername(u) {
  return `${u.trim().toLowerCase()}@${VIRTUAL_DOMAIN}`;
}

export function validateUsername(u) {
  if (!u) return "Введи nickname";
  if (u.length < 3 || u.length > 24) return "3–24 символа";
  if (!/^[a-zA-Z0-9_]+$/.test(u)) return "Только латиница, цифры, _";
  return null;
}

/* ============================================================
   Accounts (мультиаккаунт)
   ============================================================ */
export function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]"); }
  catch { return []; }
}

export function saveAccounts(list) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

export function rememberAccount({ id, username, nexora_id, avatar_url }) {
  const list = loadAccounts().filter((a) => a.id !== id);
  list.unshift({ id, username, nexora_id, avatar_url, added_at: Date.now() });
  saveAccounts(list.slice(0, 8));
}

export function forgetAccount(id) {
  saveAccounts(loadAccounts().filter((a) => a.id !== id));
}

/* ============================================================
   Auth Service — вызывается через инстанс NEXORA
   ============================================================ */
export class AuthService {
  constructor(app) {
    this.app = app;
  }

  /* ---------- UI helpers ---------- */
  showAuthCard(which) {
    ["login", "register", "mfa"].forEach((k) => {
      const el = $("auth-" + k);
      if (el) el.classList.toggle("hidden", k !== which);
    });
    this.clearAuthErrors();
  }

  clearAuthErrors() {
    ["login-error", "reg-error", "mfa-error"].forEach((id) => {
      const el = $(id);
      if (el) { el.textContent = ""; el.classList.remove("show"); }
    });
  }

  showError(id, msg) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    // Sound optional
    if (this.app?.sounds?.error) this.app.sounds.error();
  }

  /* ---------- Register ---------- */
  async doRegister() {
    this.clearAuthErrors();
    const u = $("reg-username").value.trim();
    const p1 = $("reg-password").value;
    const p2 = $("reg-password2").value;

    const uErr = validateUsername(u);
    if (uErr) return this.showError("reg-error", uErr);
    if (p1.length < 8) return this.showError("reg-error", "Пароль минимум 8 символов");
    if (p1 !== p2) return this.showError("reg-error", "Пароли не совпадают");

    const btn = $("btn-register");
    btn.disabled = true; btn.textContent = "Создаём…";

    try {
      const { data, error } = await supabase.auth.signUp({
        email: emailFromUsername(u),
        password: p1,
        options: { data: { username: u.toLowerCase() } },
      });
      if (error) throw error;
      if (data.user?.identities?.length === 0) {
        throw new Error("Такой nickname уже занят");
      }
      toast("Аккаунт создан. Входим…", "success");
      if (this.app?.sounds?.success) this.app.sounds.success();
      await this.doLogin(u, p1, true);
    } catch (e) {
      this.showError("reg-error", e.message || "Ошибка регистрации");
    } finally {
      btn.disabled = false;
      btn.textContent = "Create account";
    }
  }

  /* ---------- Login ---------- */
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
        email: emailFromUsername(u),
        password: p,
      });
      if (error) throw error;

      this.app.user = data.user;

      // Проверка 2FA
      try {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const hasTotp = (factors?.totp || []).some((f) => f.status === "verified");
        if (hasTotp) {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
            this.app.showScreen("screen-auth");
            this.showAuthCard("mfa");
            return;
          }
        }
      } catch (_) {}

      await this.app.loadProfile();
      if (this.app.profile) {
        rememberAccount({
          id: this.app.user.id,
          username: this.app.profile.username,
          nexora_id: this.app.profile.nexora_id,
          avatar_url: this.app.profile.avatar_url,
        });
      }

      try {
        await supabase.rpc("log_login_event", {
          user_agent: navigator.userAgent || "",
          ip: null,
        });
      } catch (_) {}

      toast("Добро пожаловать!", "success");
      if (this.app?.sounds?.success) this.app.sounds.success();
      this.app.enterApp();
    } catch (e) {
      const msg = /invalid/i.test(e.message || "")
        ? "Неверный логин или пароль"
        : e.message || "Ошибка входа";
      if (!silent) this.showError("login-error", msg);
      else throw e;
    } finally {
      if (!silent) {
        btn.disabled = false;
        btn.textContent = "Sign in";
      }
    }
  }

  /* ---------- 2FA ---------- */
  async doMfaVerify() {
    this.clearAuthErrors();
    const code = $("mfa-code").value.trim();
    if (!/^\d{6}$/.test(code)) return this.showError("mfa-error", "Введи 6 цифр");

    const btn = $("btn-mfa");
    btn.disabled = true; btn.textContent = "Проверяем…";

    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = (factors?.totp || []).find((f) => f.status === "verified");
      if (!totp) throw new Error("TOTP-фактор не найден");

      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({
        factorId: totp.id,
      });
      if (cErr) throw cErr;

      const { error } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: ch.id,
        code,
      });
      if (error) throw error;

      await this.app.loadProfile();
      if (this.app.profile) {
        rememberAccount({
          id: this.app.user.id,
          username: this.app.profile.username,
          nexora_id: this.app.profile.nexora_id,
          avatar_url: this.app.profile.avatar_url,
        });
      }
      try {
        await supabase.rpc("log_login_event", {
          user_agent: navigator.userAgent || "",
          ip: null,
        });
      } catch (_) {}

      toast("Проверено", "success");
      if (this.app?.sounds?.success) this.app.sounds.success();
      this.app.enterApp();
    } catch (e) {
      this.showError("mfa-error", e.message || "Неверный код");
    } finally {
      btn.disabled = false;
      btn.textContent = "Verify";
    }
  }

  /* ---------- Toggle 2FA (в настройках) ---------- */
  async toggle2FA() {
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = (factors?.totp || []).find((f) => f.status === "verified");
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
      this.app.closeModal();
      setTimeout(() => this.app.openTotpModal(enroll), 100);
    } catch (e) {
      toast(e.message || "Ошибка 2FA", "error");
    }
  }

  /* ---------- Change password ---------- */
  async changePassword() {
    const p = prompt("Новый пароль (мин. 8):");
    if (!p) return;
    if (p.length < 8) return toast("Минимум 8 символов", "warning");
    try {
      const { error } = await supabase.auth.updateUser({ password: p });
      if (error) throw error;
      toast("Пароль изменён", "success");
      if (this.app?.sounds?.success) this.app.sounds.success();
    } catch (e) {
      toast(e.message || "Ошибка", "error");
    }
  }

  /* ---------- Logout ---------- */
  async logout(silent = false) {
    if (!silent && !confirm("Выйти из NEXORA?")) return;

    try { await this.app.setOnline(false); } catch (_) {}

    if (this.app.user && this.app.profile && !silent) {
      rememberAccount({
        id: this.app.user.id,
        username: this.app.profile.username,
        nexora_id: this.app.profile.nexora_id,
        avatar_url: this.app.profile.avatar_url,
      });
    }

    await supabase.auth.signOut();

    this.app.stopRealtime?.();
    this.app.stopGlobalRealtime?.();
    this.app.stopPresence?.();
    this.app.stopPolling?.();

    this.app.user = null;
    this.app.profile = null;
    this.app.activeChat = null;
    this.app.messages = [];
    this.app.chats = [];
    this.app.contacts = [];

    this.app.showScreen("screen-auth");
    this.showAuthCard("login");
  }

  /* ---------- Switch account ---------- */
  async switchAccount(accountId) {
    if (!confirm("Переключиться на этот аккаунт?")) return;

    if (this.app.user && this.app.profile) {
      rememberAccount({
        id: this.app.user.id,
        username: this.app.profile.username,
        nexora_id: this.app.profile.nexora_id,
        avatar_url: this.app.profile.avatar_url,
      });
    }
    try { await this.app.setOnline(false); } catch (_) {}

    await supabase.auth.signOut();
    this.app.stopRealtime?.();
    this.app.stopGlobalRealtime?.();
    this.app.stopPresence?.();
    this.app.stopPolling?.();

    this.app.user = null;
    this.app.profile = null;
    this.app.activeChat = null;
    this.app.messages = [];
    this.app.chats = [];
    this.app.contacts = [];

    this.app.showScreen("screen-auth");
    this.showAuthCard("login");

    const acc = loadAccounts().find((a) => a.id === accountId);
    if (acc) {
      $("login-username").value = acc.username;
      $("login-password").focus();
      toast(`Введи пароль для @${acc.username}`, "info");
    }
  }
}