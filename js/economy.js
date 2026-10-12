/* ============================================================
   NEXORA — js/economy.js
   Экономика: Sparks, N-Coins, ежедневная награда, транзакции.
   ЭТАП 1: только базовая структура (заглушка).
   ЭТАП 3: полная реализация UI и логики.
   ============================================================ */

import { supabase } from "./supabase.js";
import { $, toast, formatDateTime } from "./util.js";

export class EconomyService {
  constructor(app) {
    this.app = app;
    this.balance = null;   // { ncoins, sparks, sparks_streak, last_daily_claim, lifetime_sparks, can_claim_today }
    this.transactions = [];
  }

  /* ---------- Загрузка баланса ---------- */
  async loadBalance() {
    try {
      const { data, error } = await supabase.rpc("get_my_balance");
      if (error) throw error;
      this.balance = Array.isArray(data) ? data[0] : data;
      return this.balance;
    } catch (e) {
      console.warn("loadBalance:", e.message);
      return null;
    }
  }

  /* ---------- Ежедневная награда ---------- */
  async claimDailyReward() {
    try {
      const { data, error } = await supabase.rpc("claim_daily_reward");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      await this.loadBalance();
      if (row) {
        let msg = `+${row.ncoins_added} N-Coins, +${row.sparks_added} Sparks`;
        if (row.is_streak_bonus) msg += " 🔥 (недельный бонус!)";
        toast(msg, "success");
        this.app.sounds?.success();
      }
      return row;
    } catch (e) {
      toast(e.message || "Не удалось получить награду", "error");
      return null;
    }
  }

  /* ---------- История транзакций ---------- */
  async loadTransactions(limit = 50, offset = 0) {
    try {
      const { data, error } = await supabase.rpc("get_my_transactions", {
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      this.transactions = data || [];
      return this.transactions;
    } catch (e) {
      console.warn("loadTransactions:", e.message);
      return [];
    }
  }

  /* ---------- Открыть окно экономики ---------- */
  openEconomyDialog() {
    this.app.openModal({
      title: "💰 Экономика",
      wide: true,
      body: async (body) => {
        body.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
        await this.loadBalance();
        const b = this.balance || { ncoins: 0, sparks: 0, sparks_streak: 0, can_claim_today: true };

        body.innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
            <div class="settings-section" style="margin:0;background:linear-gradient(135deg,rgba(255,181,71,0.15),rgba(255,90,110,0.10))">
              <div style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px">Sparks</div>
              <div style="font-size:36px;font-weight:800;color:var(--warning);margin-top:6px">🔥 ${b.sparks}</div>
              <div style="font-size:12px;color:var(--text-2);margin-top:4px">Серия: ${b.sparks_streak} ${b.sparks_streak === 1 ? "день" : "дней"}</div>
            </div>
            <div class="settings-section" style="margin:0;background:linear-gradient(135deg,rgba(77,166,255,0.15),rgba(124,92,255,0.10))">
              <div style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px">N-Coins</div>
              <div style="font-size:36px;font-weight:800;color:var(--accent);margin-top:6px">🪙 ${b.ncoins}</div>
              <div style="font-size:12px;color:var(--text-2);margin-top:4px">Всего: ${b.lifetime_sparks} sparks</div>
            </div>
          </div>
          <div id="econ-daily-section"></div>
          <div class="settings-section">
            <h3>История</h3>
            <div id="econ-history"><div class="empty-state">Загрузка…</div></div>
          </div>`;

        // Daily
        const dailySection = body.querySelector("#econ-daily-section");
        const canClaim = b.can_claim_today;
        dailySection.innerHTML = `
          <div class="settings-section" style="background:linear-gradient(135deg,rgba(124,92,255,0.15),rgba(77,166,255,0.10));border-color:var(--accent)">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
              <div>
                <div style="font-size:15px;font-weight:700;color:var(--text-0)">🎁 Ежедневная награда</div>
                <div style="font-size:12px;color:var(--text-2);margin-top:4px">
                  ${canClaim ? "Доступна сегодня" : "Уже получена. Возвращайся завтра!"}
                </div>
              </div>
              <button class="btn btn-primary" id="econ-claim-btn" ${canClaim ? "" : "disabled"}>
                ${canClaim ? "Получить" : "Получено"}
              </button>
            </div>
          </div>`;
        const claimBtn = dailySection.querySelector("#econ-claim-btn");
        if (canClaim) {
          claimBtn.addEventListener("click", async () => {
            claimBtn.disabled = true;
            claimBtn.textContent = "…";
            const row = await this.claimDailyReward();
            if (row) {
              this.app.closeModal();
              setTimeout(() => this.openEconomyDialog(), 200);
            } else {
              claimBtn.disabled = false;
              claimBtn.textContent = "Получить";
            }
          });
        }

        // History
        const historyBox = body.querySelector("#econ-history");
        const txs = await this.loadTransactions(30, 0);
        if (!txs.length) {
          historyBox.innerHTML = `<div class="empty-state">Пока ничего нет</div>`;
        } else {
          historyBox.innerHTML = "";
          txs.forEach((t) => {
            const row = document.createElement("div");
            row.className = "settings-row";
            const sign = t.amount >= 0 ? "+" : "";
            const color = t.amount >= 0 ? "var(--success)" : "var(--error)";
            const currencyIcon = t.currency === "sparks" ? "🔥" : "🪙";
            const kindLabel = {
              daily: "Ежедневная",
              quest: "Задание",
              purchase: "Покупка",
              admin: "Админ",
              streak_bonus: "Бонус серии",
            }[t.kind] || t.kind;
            row.innerHTML = `
              <div class="settings-row-info">
                <div class="settings-row-label">${currencyIcon} ${kindLabel}</div>
                <div class="settings-row-desc">${escapeHtml(formatDateTime(t.created_at))}${t.meta?.item_id ? " · " + escapeHtml(t.meta.item_id) : ""}</div>
              </div>
              <div style="font-weight:700;color:${color}">${sign}${t.amount}</div>`;
            historyBox.appendChild(row);
          });
        }
      },
    });
  }
}

/* Локальный escape (не тащить лишние импорты) */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}