// Chrome's built-in chrome.i18n follows the browser locale and cannot be switched at runtime,
// so translations are handled here to let the user pick the language from the popup.

const MESSAGES = {
  en: {
    subtitle: "Game analysis",
    usernamePlaceholder: "Your chess.com username",
    load: "Load",
    analyze: "Analyze",
    loading: "Loading games…",
    noGames: "No games found for this user.",
    "errors.userNotFound": "User not found.",
    "errors.loadFailed": "Couldn't load games. Try again.",
    "color.white": "White",
    "color.black": "Black",
    "outcome.win": "W",
    "outcome.loss": "L",
    "outcome.draw": "D",
    "timeClass.bullet": "Bullet",
    "timeClass.blitz": "Blitz",
    "timeClass.rapid": "Rapid",
    "timeClass.daily": "Daily",
    "review.title": "Game review",
    "review.analyzing": "Analyzing… {done}/{total}",
    "review.failed": "Couldn't analyze the game.",
    "review.noGame": "No game selected.",
    "review.best": "Best: {move}",
    "review.accuracy": "Accuracy",
    "review.variation": "Variation",
    "review.backToGame": "Back to game",
    "class.brilliant": "Brilliant",
    "class.great": "Great",
    "class.best": "Best",
    "class.excellent": "Excellent",
    "class.good": "Good",
    "class.book": "Book",
    "class.inaccuracy": "Inaccuracy",
    "class.mistake": "Mistake",
    "class.miss": "Miss",
    "class.blunder": "Blunder",
  },
  es: {
    subtitle: "Análisis de partidas",
    usernamePlaceholder: "Tu usuario de chess.com",
    load: "Cargar",
    analyze: "Analizar",
    loading: "Cargando partidas…",
    noGames: "No hay partidas para este usuario.",
    "errors.userNotFound": "Usuario no encontrado.",
    "errors.loadFailed": "No se pudieron cargar las partidas. Inténtalo de nuevo.",
    "color.white": "Blancas",
    "color.black": "Negras",
    "outcome.win": "V",
    "outcome.loss": "D",
    "outcome.draw": "T",
    "timeClass.bullet": "Bullet",
    "timeClass.blitz": "Blitz",
    "timeClass.rapid": "Rápida",
    "timeClass.daily": "Diaria",
    "review.title": "Análisis de la partida",
    "review.analyzing": "Analizando… {done}/{total}",
    "review.failed": "No se pudo analizar la partida.",
    "review.noGame": "No hay ninguna partida seleccionada.",
    "review.best": "Mejor: {move}",
    "review.accuracy": "Precisión",
    "review.variation": "Variante",
    "review.backToGame": "Volver a la partida",
    "class.brilliant": "Brillante",
    "class.great": "Genial",
    "class.best": "Mejor",
    "class.excellent": "Excelente",
    "class.good": "Buena",
    "class.book": "Teoría",
    "class.inaccuracy": "Imprecisión",
    "class.mistake": "Error",
    "class.miss": "Oportunidad perdida",
    "class.blunder": "Error grave",
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

/** Translates every element under `root` marked with data-i18n (text) or data-i18n-placeholder. */
export function applyTranslations(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
}
