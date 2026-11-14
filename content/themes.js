"use strict";

/*
 * RiftStream AutoFarm — catálogo de temas
 * =========================================================================
 * Paletas inspiradas nos temas do OpenCode: cada uma define as cores de
 * fundo, superfície, texto e dois destaques. O painel e o popup aplicam as
 * mesmas variáveis, então trocar de tema num lugar vale para os dois.
 *
 * `modo` é "dark" ou "light" e serve só para ajustes de sombra/contraste.
 * ========================================================================= */

(() => {
  if (window.RSAF_THEMES) return;

  const TEMAS = {
    farmline: {
      nome: "Farmline", modo: "dark",
      bg: "#07110e", bg2: "#0a1a15", surface: "#0f2620", surface2: "#143029",
      line: "#1d443a", line2: "#2a5c4d", text: "#e4fff6", muted: "#7fa89c",
      accent: "#4de3b0", accent2: "#5cc8ff", red: "#ff7a7a", extra: "#9d8bff"
    },
    opencode: {
      nome: "OpenCode", modo: "dark",
      bg: "#0d0f12", bg2: "#12151a", surface: "#181c22", surface2: "#20252d",
      line: "#2a313a", line2: "#3a4350", text: "#e7e9ee", muted: "#8b95a3",
      accent: "#7aa2f7", accent2: "#bb9af7", red: "#f7768e", extra: "#9d7cd8"
    },
    midnight: {
      nome: "Meia-noite", modo: "dark",
      bg: "#080e1c", bg2: "#0c1428", surface: "#111c36", surface2: "#182647",
      line: "#223461", line2: "#2f4680", text: "#e2eaff", muted: "#8b9cc9",
      accent: "#5cc8ff", accent2: "#9d8bff", red: "#ff7a9a", extra: "#9d8bff"
    },
    tokyo: {
      nome: "Tóquio", modo: "dark",
      bg: "#13141c", bg2: "#1a1b26", surface: "#20222f", surface2: "#292b3a",
      line: "#32364a", line2: "#434761", text: "#c9d4f7", muted: "#7f8bb5",
      accent: "#7aa2f7", accent2: "#bb9af7", red: "#f7768e", extra: "#bb9af7"
    },
    dracula: {
      nome: "Drácula", modo: "dark",
      bg: "#191524", bg2: "#201b2e", surface: "#282236", surface2: "#322b45",
      line: "#3d3554", line2: "#4f4569", text: "#f3ecff", muted: "#a89cc6",
      accent: "#bd93f9", accent2: "#8be9fd", red: "#ff79c6", extra: "#ff79c6"
    },
    nord: {
      nome: "Nórdico", modo: "dark",
      bg: "#1b2029", bg2: "#212833", surface: "#28303d", surface2: "#313b4a",
      line: "#3c4859", line2: "#4c5a6e", text: "#e5ecf5", muted: "#8e9db0",
      accent: "#88c0d0", accent2: "#81a1c1", red: "#bf616a", extra: "#b48ead"
    },
    gruvbox: {
      nome: "Gruvbox", modo: "dark",
      bg: "#1b1916", bg2: "#23201b", surface: "#2b2721", surface2: "#373127",
      line: "#463d31", line2: "#5a4d3b", text: "#f2e8d5", muted: "#b3a48a",
      accent: "#e8b764", accent2: "#8ec07c", red: "#fb4934", extra: "#d3869b"
    },
    rosepine: {
      nome: "Rosa", modo: "dark",
      bg: "#181624", bg2: "#1f1d2e", surface: "#26233a", surface2: "#2f2b45",
      line: "#3d3859", line2: "#514a70", text: "#e0def4", muted: "#9a94b8",
      accent: "#ebbcba", accent2: "#9ccfd8", red: "#eb6f92", extra: "#c4a7e7"
    },
    liah: {
      nome: "Tema da Liah", modo: "dark",
      bg: "#1a0f18", bg2: "#221320", surface: "#2c1828", surface2: "#381e33",
      line: "#4a2742", line2: "#613454", text: "#ffe8f5", muted: "#c48fae",
      accent: "#ff79c6", accent2: "#c9a0ff", red: "#ff5c7a", extra: "#ff9ee0"
    },
    solarized: {
      nome: "Solarizado", modo: "dark",
      bg: "#002b36", bg2: "#073642", surface: "#0b3f4c", surface2: "#10505f",
      line: "#14566a", line2: "#1b6a80", text: "#eee8d5", muted: "#93a1a1",
      accent: "#2aa198", accent2: "#268bd2", red: "#dc322f", extra: "#6c71c4"
    },
    daybreak: {
      nome: "Amanhecer", modo: "light",
      bg: "#eef4fb", bg2: "#f8fbff", surface: "#ffffff", surface2: "#e2edf9",
      line: "#c3d7ec", line2: "#a3c0dd", text: "#10233b", muted: "#4f6b8a",
      accent: "#1f7ae0", accent2: "#0f9fb5", red: "#c93a3a", extra: "#7a5bd6"
    },
    paper: {
      nome: "Papel", modo: "light",
      bg: "#f4f2ee", bg2: "#faf9f6", surface: "#ffffff", surface2: "#ece8e1",
      line: "#d8d2c7", line2: "#bfb7a8", text: "#262320", muted: "#6e675d",
      accent: "#c26a1b", accent2: "#2b7a78", red: "#b23a3a", extra: "#7a5bd6"
    },
    mint: {
      nome: "Menta clara", modo: "light",
      bg: "#edfaf4", bg2: "#f7fffb", surface: "#ffffff", surface2: "#e6f5ee",
      line: "#c6e6d9", line2: "#a7d5c5", text: "#0b2b22", muted: "#4f776b",
      accent: "#0a9d74", accent2: "#0b78a8", red: "#c93a3a", extra: "#6b5bd6"
    }
  };

  // Nomes antigos ("dark"/"light") continuam válidos para quem já tem config.
  const ALIASES = { dark: "farmline", light: "mint" };
  const ORDEM = [
    "farmline", "opencode", "midnight", "tokyo", "dracula", "nord",
    "gruvbox", "rosepine", "liah", "solarized", "daybreak", "paper", "mint"
  ];

  function resolver(id) {
    const chave = ALIASES[id] || id;
    return TEMAS[chave] ? chave : "farmline";
  }

  // Variáveis do painel (Shadow DOM) a partir da paleta.
  function varsPainel(t) {
    const claro = t.modo === "light";
    return {
      "--bg": t.bg,
      "--bg2": t.bg2,
      "--surface": t.surface,
      "--surface2": t.surface2,
      "--line": t.line,
      "--line2": t.line2,
      "--text": t.text,
      "--muted": t.muted,
      "--mint": t.accent,
      "--mint-dim": t.accent + (claro ? "16" : "1f"),
      "--cyan": t.accent2,
      "--red": t.red,
      "--shadow": claro
        ? `0 22px 55px ${t.text}22, 0 0 0 1px ${t.line}`
        : "0 24px 64px #000000c9, 0 0 0 1px #00000055"
    };
  }

  // Variáveis do popup (documento normal) a partir da mesma paleta.
  function varsPopup(t) {
    const claro = t.modo === "light";
    return {
      "--bg": t.bg,
      "--bg2": t.bg2,
      "--panel": t.surface,
      "--panel2": t.surface2,
      "--line": t.line,
      "--line2": t.line2,
      "--text": t.text,
      "--muted": t.muted,
      "--gold": t.accent,
      "--gold-dim": t.accent + (claro ? "16" : "1f"),
      "--green": t.accent,
      "--red": t.red,
      "--blue": t.accent2,
      "--purple": t.extra
    };
  }

  window.RSAF_THEMES = TEMAS;
  window.RSAF_THEME_ORDER = ORDEM;
  window.RSAF_THEME_ALIASES = ALIASES;
  window.RSAF_resolverTema = resolver;
  window.RSAF_varsPainel = varsPainel;
  window.RSAF_varsPopup = varsPopup;
})();
