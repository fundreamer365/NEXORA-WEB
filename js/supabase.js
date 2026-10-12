/* ============================================================
   NEXORA — js/supabase.js
   Единственный Supabase-клиент + все константы проекта.
   НЕ создавать createClient в других модулях!
   ============================================================ */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ---------- Supabase ---------- */
export const SUPABASE_URL = "https://jylukilnkgkvmjnierqy.supabase.co";
export const SUPABASE_KEY = "sb_publishable_U5rKld1LYukIaFZecnYNaA_cgaJZu4R";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "nexora-auth",
  },
});

/* ---------- Домен / виртуальная почта ---------- */
export const VIRTUAL_DOMAIN = "nexora.local";

/* ---------- Storage Buckets ---------- */
export const AVATAR_BUCKET = "avatars";
export const ATTACH_BUCKET = "attachments";
export const STICKER_BUCKET = "stickers";
export const SOUND_BUCKET = "sounds";
export const BADGE_BUCKET = "badges";
export const WALLPAPER_BUCKET = "wallpapers";

/* ---------- Лимиты загрузок ---------- */
export const AVATAR_MAX = 2 * 1024 * 1024;
export const COVER_MAX = 4 * 1024 * 1024;
export const ATTACH_MAX = 50 * 1024 * 1024;
export const STICKER_MAX = 2 * 1024 * 1024;
export const SOUND_MAX = 1 * 1024 * 1024;
export const BADGE_MAX = 1 * 1024 * 1024;
export const WALLPAPER_MAX = 6 * 1024 * 1024;

/* ---------- Константы чата ---------- */
export const POLL_MS = 20000;
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "😮", "😢"];
export const TYPING_TIMEOUT_MS = 3000;

/* ---------- LocalStorage keys ---------- */
export const ACCOUNTS_KEY = "nexora-accounts";
export const RECENT_EMOJI_KEY = "nexora-recent-emoji";
export const RECENT_REACTIONS_KEY = "nexora-recent-reactions";
export const HIDDEN_MSGS_KEY = "nexora-hidden-msgs";
export const UI_PREFS_KEY = "nexora-ui-prefs";

/* ---------- LiveKit (для голосовых комнат, Этап 4) ---------- */
export const LIVEKIT_URL = "wss://nexora-ooy939al.livekit.cloud";
// API key/secret НЕ хранить здесь — только в Supabase Edge Function Secrets.