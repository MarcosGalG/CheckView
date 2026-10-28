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
    "explain.checkmate": "Checkmate!",
    "explain.mateIn": "Forced mate in {n}.",
    "explain.best": "The best move in this position.",
    "explain.great": "The only move that keeps your position.",
    "explain.brilliant": "A sound sacrifice: you give up {piece}.",
    "explain.miss": "Your opponent had just slipped and you didn't punish it.",
    "explain.allowsMate": "This allows mate in {n}: {line}",
    "explain.losesPiece": "You lose {piece}: {line}",
    "explain.losesMaterial": "You lose material: {line}",
    "explain.missedMate": "You had mate in {n} starting with {move}.",
    "explain.missedPiece": "{move} won {piece}.",
    "explain.missedFork": "{move} was a fork that won {piece}.",
    "explain.doubled": "This leaves you with doubled pawns on the {file}-file.",
    "explain.isolated": "This leaves an isolated pawn on {square}.",
    "explain.kingShelter": "This weakens the pawns in front of your king.",
    "explain.positional": "You don't lose material, but your position gets worse.",
    "explain.book": "Opening theory: {opening}.",
    "explain.bookUnnamed": "A known opening move.",
    "pieceA.p": "a pawn",
    "pieceA.n": "a knight",
    "pieceA.b": "a bishop",
    "pieceA.r": "a rook",
    "pieceA.q": "the queen",
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
    "explain.checkmate": "¡Jaque mate!",
    "explain.mateIn": "Mate forzado en {n}.",
    "explain.best": "La mejor jugada en esta posición.",
    "explain.great": "La única jugada que mantiene tu posición.",
    "explain.brilliant": "Un sacrificio correcto: entregas {piece}.",
    "explain.miss": "Tu rival acababa de fallar y no lo aprovechaste.",
    "explain.allowsMate": "Permites mate en {n}: {line}",
    "explain.losesPiece": "Pierdes {piece}: {line}",
    "explain.losesMaterial": "Pierdes material: {line}",
    "explain.missedMate": "Tenías mate en {n} empezando por {move}.",
    "explain.missedPiece": "Con {move} ganabas {piece}.",
    "explain.missedFork": "{move} era una horquilla que ganaba {piece}.",
    "explain.doubled": "Te quedan peones doblados en la columna {file}.",
    "explain.isolated": "Dejas un peón aislado en {square}.",
    "explain.kingShelter": "Debilitas los peones que protegen a tu rey.",
    "explain.positional": "No pierdes material, pero tu posición empeora.",
    "explain.book": "Teoría de apertura: {opening}.",
    "explain.bookUnnamed": "Jugada conocida de la apertura.",
    "pieceA.p": "un peón",
    "pieceA.n": "un caballo",
    "pieceA.b": "un alfil",
    "pieceA.r": "una torre",
    "pieceA.q": "la dama",
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
