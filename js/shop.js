/* ============================================================
   NEXORA — js/shop.js
   Магазин косметики: каталог, покупки, инвентарь, экипировка.
   ЭТАП 1: базовая структура (заглушка).
   ЭТАП 3: полная реализация UI.
   ============================================================ */

import { supabase } from "./supabase.js";
import { $, toast, escapeHtml } from "./util.js";

export class ShopService {
  constructor(app) {
    this.app = app;
    this.catalog = [];
    this.inventory = [];
  }

  async loadCatalog() {
    try {
      const { data, error } = await supabase.from("shop_items")
        .select("*")
        .eq("is_active", true)
        .order("price_ncoins", { ascending: true });
      if (error) throw error;
      this.catalog = data || [];
      return this.catalog;
    } catch (e) {
      console.warn("loadCatalog:", e.message);
      return [];
    }
  }

  async loadInventory() {
    try {
      const { data, error } = await supabase.rpc("get_my_inventory");
      if (error) throw error;
      this.inventory = data || [];
      return this.inventory;
    } catch (e) {
      console.warn("loadInventory:", e.message);
      return [];
    }
  }

  async buyItem(itemId) {
    try {
      const { error } = await supabase.rpc("buy_item", { p_item_id: itemId });
      if (error) throw error;
      toast("Куплено!", "success");
      this.app.sounds?.success();
      return true;
    } catch (e) {
      toast(e.message || "Не удалось купить", "error");
      return false;
    }
  }

  async equipItem(slot, itemId) {
    try {
      const { error } = await supabase.rpc("equip_cosmetic", {
        p_slot: slot,
        p_item_id: itemId,
      });
      if (error) throw error;
      toast("Применено", "success");
      this.app.sounds?.success();
      return true;
    } catch (e) {
      toast(e.message || "Ошибка", "error");
      return false;
    }
  }

  async unequipItem(slot) {
    try {
      const { error } = await supabase.rpc("unequip_cosmetic", { p_slot: slot });
      if (error) throw error;
      toast("Снято", "warning");
      return true;
    } catch (e) {
      toast(e.message || "Ошибка", "error");
      return false;
    }
  }

  /* ---------- Открыть магазин ---------- */
  openShopDialog() {
    this.app.openModal({
      title: "🛍 NEXORA Shop",
      wide: true,
      body: async (body) => {
        body.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
        await Promise.all([this.loadCatalog(), this.loadInventory()]);
        const owned = new Set(this.inventory.map((i) => i.item_id));

        // Баланс
        await this.app.economyService.loadBalance();
        const bal = this.app.economyService.balance || { ncoins: 0 };

        body.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding:12px 16px;background:var(--bg-2);border-radius:12px">
            <div style="font-size:14px;color:var(--text-2)">Баланс:</div>
            <div style="font-size:20px;font-weight:800;color:var(--accent)">🪙 ${bal.ncoins} N-Coins</div>
          </div>
          <div id="shop-categories" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px"></div>
          <div id="shop-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px"></div>`;

        const categories = [...new Set(this.catalog.map((c) => c.category))];
        const catLabels = {
          avatar_frame: "Рамки",
          badge: "Значки",
          theme: "Темы",
          wallpaper: "Обои",
          msg_effect: "Эффекты",
          profile_decor: "Декор профиля",
          sparks_effect: "Sparks",
        };

        let activeCat = categories[0] || null;
        const catBox = body.querySelector("#shop-categories");
        const gridBox = body.querySelector("#shop-grid");

        const renderGrid = () => {
          gridBox.innerHTML = "";
          const items = this.catalog.filter((c) => !activeCat || c.category === activeCat);
          if (!items.length) {
            gridBox.innerHTML = `<div class="empty-state" style="grid-column:1/-1">Ничего нет в этой категории</div>`;
            return;
          }
          items.forEach((it) => {
            const isOwned = owned.has(it.id);
            const canAfford = bal.ncoins >= it.price_ncoins;
            const card = document.createElement("div");
            card.style.cssText = "background:var(--bg-2);border:1px solid var(--border);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px";
            const rarityColors = {
              common: "#8a8a9c", rare: "#4da6ff", epic: "#a78bfa", legendary: "#ffb547",
            };
            const rarityColor = rarityColors[it.rarity] || "#8a8a9c";
            card.innerHTML = `
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                <div style="font-size:14px;font-weight:700;color:var(--text-0)">${escapeHtml(it.name)}</div>
                <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;background:${rarityColor}22;color:${rarityColor};text-transform:uppercase">${it.rarity}</span>
              </div>
              <div style="font-size:12px;color:var(--text-2);min-height:32px">${escapeHtml(it.description || "")}</div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                <div style="font-weight:700;color:${canAfford ? "var(--accent)" : "var(--error)"}">🪙 ${it.price_ncoins}</div>
                <button class="btn ${isOwned ? "btn-ghost" : "btn-primary"}" ${!isOwned && !canAfford ? "disabled" : ""}>
                  ${isOwned ? "✓ Куплено" : "Купить"}
                </button>
              </div>`;
            const btn = card.querySelector("button");
            if (!isOwned) {
              btn.addEventListener("click", async () => {
                btn.disabled = true;
                btn.textContent = "…";
                const ok = await this.buyItem(it.id);
                if (ok) {
                  this.app.closeModal();
                  setTimeout(() => this.openShopDialog(), 200);
                } else {
                  btn.disabled = false;
                  btn.textContent = "Купить";
                }
              });
            }
            gridBox.appendChild(card);
          });
        };

        categories.forEach((cat) => {
          const b = document.createElement("button");
          b.className = "btn " + (cat === activeCat ? "btn-primary" : "btn-ghost");
          b.style.cssText = "padding:6px 12px;font-size:12px";
          b.textContent = catLabels[cat] || cat;
          b.addEventListener("click", () => {
            activeCat = cat;
            catBox.querySelectorAll("button").forEach((x) => x.className = "btn btn-ghost");
            b.className = "btn btn-primary";
            renderGrid();
          });
          catBox.appendChild(b);
        });

        renderGrid();
      },
    });
  }
}