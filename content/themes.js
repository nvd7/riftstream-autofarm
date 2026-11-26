"use strict";

/*
 * RiftStream AutoFarm — tema único
 * =========================================================================
 * Uma paleta só, inspirada no visual "SynExBypass": preto profundo, ondas
 * violeta/rosa e estrelas. Painel e popup usam as mesmas variáveis, thenão
 * existe seletor de tema nem migração de paletas antigas.
 * ========================================================================= */

(() => {
  if (window.RSAF_THEMES) return;

  const tema = {
    id: "riftviolet",
    nome: "Rift Violet",
    modo: "dark",
    bg: "#07060c",
    bg2: "#0e0b18",
    surface: "#141021",
    surface2: "#1d1730",
    line: "#2b2342",
    line2: "#3d2f5c",
    text: "#f6f3ff",
    muted: "#9a90b8",
    accent: "#a06bff",
    accent2: "#ff5fd2",
    red: "#ff5c8a",
    extra: "#5cc8ff"
  };

  // IDs antigos caem no único tema. Config salva com qualquer paleta antiga
  // continua funcionando sem pedir escolha ao jogador.
  const ALIASES = {
    dark: tema.id, light: tema.id,
    farmline: tema.id, opencode: tema.id, midnight: tema.id, tokyo: tema.id,
    dracula: tema.id, nord: tema.id, gruvbox: tema.id, rosepine: tema.id,
    liah: tema.id, nvd: tema.id, solarized: tema.id, daybreak: tema.id,
    paper: tema.id, mint: tema.id
  };

  function resolver(id) {
    return ALIASES[id] || (id === tema.id ? id : tema.id);
  }

  function varsPainel() {
    return {
      "--bg": tema.bg,
      "--bg2": tema.bg2,
      "--surface": tema.surface,
      "--surface2": tema.surface2,
      "--line": tema.line,
      "--line2": tema.line2,
      "--text": tema.text,
      "--muted": tema.muted,
      "--mint": tema.accent,
      "--mint-dim": tema.accent + "22",
      "--cyan": tema.accent2,
      "--red": tema.red,
      "--shadow": "0 24px 70px #000000e6, 0 0 0 1px #a06bff1f"
    };
  }

  function varsPopup() {
    return {
      "--bg": tema.bg,
      "--bg2": tema.bg2,
      "--panel": tema.surface,
      "--panel2": tema.surface2,
      "--line": tema.line,
      "--line2": tema.line2,
      "--text": tema.text,
      "--muted": tema.muted,
      "--gold": tema.accent,
      "--gold-dim": tema.accent + "22",
      "--green": tema.accent,
      "--red": tema.red,
      "--blue": tema.extra,
      "--purple": tema.accent2
    };
  }

  window.RSAF_THEMES = { [tema.id]: tema };
  window.RSAF_TEMA = tema;
  window.RSAF_THEME_ORDER = [tema.id];
  window.RSAF_THEME_ALIASES = ALIASES;
  window.RSAF_resolverTema = resolver;
  window.RSAF_varsPainel = varsPainel;
  window.RSAF_varsPopup = varsPopup;
})();
