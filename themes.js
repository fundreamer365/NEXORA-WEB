/* ============================================================
   NEXORA — система тем
   Профильные темы + темы чатов. Применяются автоматически.
   ============================================================ */

export const PROFILE_THEMES = {
  "nexora-dark": {
    name: "NEXORA Dark",
    isDark: true,
    vars: {
      "--bg-0": "#0a0a0f",
      "--bg-1": "#12121a",
      "--bg-2": "#1a1a24",
      "--bg-3": "#23232f",
      "--border": "#2a2a38",
      "--border-l": "#35354a",
      "--text-0": "#ffffff",
      "--text-1": "#c9c9d6",
      "--text-2": "#8a8a9c",
      "--text-3": "#5a5a70",
      "--accent": "#7c5cff",
      "--accent-h": "#9375ff",
      "--accent-dim": "rgba(124, 92, 255, 0.15)",
    },
  },
  "nexora-light": {
    name: "NEXORA Light",
    isDark: false,
    vars: {
      "--bg-0": "#f5f5fa",
      "--bg-1": "#ffffff",
      "--bg-2": "#f0f0f5",
      "--bg-3": "#e4e4ec",
      "--border": "#e0e0ea",
      "--border-l": "#d0d0dc",
      "--text-0": "#0a0a0f",
      "--text-1": "#2a2a38",
      "--text-2": "#6a6a7c",
      "--text-3": "#9a9aac",
      "--accent": "#7c5cff",
      "--accent-h": "#9375ff",
      "--accent-dim": "rgba(124, 92, 255, 0.15)",
    },
  },
  ocean: {
    name: "Ocean",
    isDark: true,
    vars: {
      "--bg-0": "#060d1a",
      "--bg-1": "#0c1626",
      "--bg-2": "#122036",
      "--bg-3": "#1a2c48",
      "--border": "#1f3352",
      "--border-l": "#2c466b",
      "--text-0": "#e6f0ff",
      "--text-1": "#a8bedb",
      "--text-2": "#6b85a6",
      "--text-3": "#455c7a",
      "--accent": "#4da6ff",
      "--accent-h": "#6fb8ff",
      "--accent-dim": "rgba(77, 166, 255, 0.15)",
    },
  },
  forest: {
    name: "Forest",
    isDark: true,
    vars: {
      "--bg-0": "#0a140d",
      "--bg-1": "#0f1e13",
      "--bg-2": "#152a1a",
      "--bg-3": "#1e3825",
      "--border": "#264633",
      "--border-l": "#345c44",
      "--text-0": "#e6f5e9",
      "--text-1": "#a9c4b2",
      "--text-2": "#6e8a77",
      "--text-3": "#4a5e51",
      "--accent": "#3ddc84",
      "--accent-h": "#5ce89c",
      "--accent-dim": "rgba(61, 220, 132, 0.15)",
    },
  },
  sunset: {
    name: "Sunset",
    isDark: true,
    vars: {
      "--bg-0": "#14090a",
      "--bg-1": "#1f1113",
      "--bg-2": "#2b181c",
      "--bg-3": "#3a2128",
      "--border": "#472b33",
      "--border-l": "#5e3943",
      "--text-0": "#ffe6e6",
      "--text-1": "#d6a8a8",
      "--text-2": "#a07b7b",
      "--text-3": "#6e5454",
      "--accent": "#ff5a6e",
      "--accent-h": "#ff7a8a",
      "--accent-dim": "rgba(255, 90, 110, 0.15)",
    },
  },
  cyber: {
    name: "Cyber",
    isDark: true,
    vars: {
      "--bg-0": "#0a0014",
      "--bg-1": "#12001e",
      "--bg-2": "#1a0028",
      "--bg-3": "#26003a",
      "--border": "#33004d",
      "--border-l": "#4d006e",
      "--text-0": "#f0e6ff",
      "--text-1": "#c0a3d6",
      "--text-2": "#8a72a3",
      "--text-3": "#5a4a6e",
      "--accent": "#ff6ad5",
      "--accent-h": "#ff85e0",
      "--accent-dim": "rgba(255, 106, 213, 0.15)",
    },
  },
  paper: {
    name: "Paper",
    isDark: false,
    vars: {
      "--bg-0": "#f5f1e8",
      "--bg-1": "#fefcf7",
      "--bg-2": "#ebe5d6",
      "--bg-3": "#dcd4c0",
      "--border": "#d4cbb3",
      "--border-l": "#b8ab8b",
      "--text-0": "#1a1611",
      "--text-1": "#4a4030",
      "--text-2": "#7a6b52",
      "--text-3": "#a89677",
      "--accent": "#c47d2d",
      "--accent-h": "#dd9545",
      "--accent-dim": "rgba(196, 125, 45, 0.15)",
    },
  },
};

export const CHAT_THEME_ACCENTS = {
  "default":  { name: "По умолчанию", accent: null },
  "purple":   { name: "Фиолетовый",   accent: "#7c5cff" },
  "ocean":    { name: "Океан",        accent: "#4da6ff" },
  "mint":     { name: "Мята",         accent: "#3ddc84" },
  "amber":    { name: "Янтарь",       accent: "#ffb547" },
  "crimson":  { name: "Кримсон",      accent: "#ff5a6e" },
  "magenta":  { name: "Маджента",     accent: "#ff6ad5" },
  "violet":   { name: "Violet",       accent: "#a78bfa" },
  "cyan":     { name: "Cyan",         accent: "#5ce1e6" },
  "lime":     { name: "Lime",         accent: "#a3e635" },
  "rose":     { name: "Rose",         accent: "#fb7185" },
  "indigo":   { name: "Indigo",       accent: "#6366f1" },
};

const PROFILE_THEME_KEY = "nexora-profile-theme";

/** Применить профильную тему */
export function applyProfileTheme(themeId) {
  const theme = PROFILE_THEMES[themeId] || PROFILE_THEMES["nexora-dark"];
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute("data-theme", theme.isDark ? "dark" : "light");
  root.setAttribute("data-theme-id", themeId);
  localStorage.setItem(PROFILE_THEME_KEY, themeId);
  return themeId;
}

/** Получить ID текущей профильной темы */
export function getProfileTheme() {
  return localStorage.getItem(PROFILE_THEME_KEY) || "nexora-dark";
}

/** Применить тему чата (только accent) */
export function applyChatTheme(theme) {
  const root = document.documentElement;
  if (theme && theme.accent) {
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-h", lighten(theme.accent, 15));
    root.style.setProperty("--accent-dim", hexToRgba(theme.accent, 0.15));
  } else {
    // Возвращаем accent профильной темы
    const profileThemeId = getProfileTheme();
    const profileTheme = PROFILE_THEMES[profileThemeId] || PROFILE_THEMES["nexora-dark"];
    root.style.setProperty("--accent", profileTheme.vars["--accent"]);
    root.style.setProperty("--accent-h", profileTheme.vars["--accent-h"]);
    root.style.setProperty("--accent-dim", profileTheme.vars["--accent-dim"]);
  }
}

export function resetChatTheme() {
  applyChatTheme(null);
}

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function lighten(hex, percent) {
  const h = hex.replace("#", "");
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
  g = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
  b = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}