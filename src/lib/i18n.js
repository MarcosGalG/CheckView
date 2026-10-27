// Chrome's built-in chrome.i18n follows the browser locale and cannot be switched at runtime,
// so translations are handled here to let the user pick the language from the popup.

const MESSAGES = {
  en: {
    subtitle: "Game analysis",
    usernamePlaceholder: "Your chess.com username",
    load: "Load",
    analyze: "Analyze",
    comingSoon: "Coming soon",
    loading: "Loading games…",
    noGames: "No games found for this user.",
    "errors.userNotFound": "User not found on chess.com.",
    "errors.requestFailed": "chess.com API error ({status}).",
    "errors.network": "Could not connect to chess.com.",
    "color.white": "White",
    "color.black": "Black",
    "outcome.win": "W",
    "outcome.loss": "L",
    "outcome.draw": "D",
    "timeClass.bullet": "Bullet",
    "timeClass.blitz": "Blitz",
    "timeClass.rapid": "Rapid",
    "timeClass.daily": "Daily",
  },
  es: {
    subtitle: "Análisis de partidas",
    usernamePlaceholder: "Tu usuario de chess.com",
    load: "Cargar",
    analyze: "Analizar",
    comingSoon: "Próximamente",
    loading: "Cargando partidas…",
    noGames: "No hay partidas para este usuario.",
    "errors.userNotFound": "Usuario no encontrado en chess.com.",
    "errors.requestFailed": "Error de la API de chess.com ({status}).",
    "errors.network": "No se pudo conectar con chess.com.",
    "color.white": "Blancas",
    "color.black": "Negras",
    "outcome.win": "V",
    "outcome.loss": "D",
    "outcome.draw": "T",
    "timeClass.bullet": "Bullet",
    "timeClass.blitz": "Blitz",
    "timeClass.rapid": "Rápida",
    "timeClass.daily": "Diaria",
  },
};

export const LANGUAGES = Object.keys(MESSAGES);
const DEFAULT_LANGUAGE = "en";

let currentLanguage = DEFAULT_LANGUAGE;

export function getLanguage() {
  return currentLanguage;
}

/** Picks the saved language if valid, otherwise the browser language, otherwise English. */
export function resolveLanguage(saved) {
  if (LANGUAGES.includes(saved)) return saved;
  const browser = navigator.language.slice(0, 2);
  return LANGUAGES.includes(browser) ? browser : DEFAULT_LANGUAGE;
}

export function setLanguage(language) {
  currentLanguage = LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  document.documentElement.lang = currentLanguage;
}

export function t(key, params = {}) {
  const template = MESSAGES[currentLanguage][key] ?? MESSAGES[DEFAULT_LANGUAGE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}

/**
 * Translates every element under `root` marked with:
 * data-i18n (text), data-i18n-placeholder or data-i18n-title.
 */
export function applyTranslations(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    el.title = t(el.dataset.i18nTitle);
  }
}
