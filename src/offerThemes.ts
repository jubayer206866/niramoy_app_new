/** Colour themes an admin can pick for an offer. Keys must match THEME_ACCENTS in server/push.mjs. */
export interface OfferTheme {
  label: string;
  /** Three gradient stops, dark to light. */
  from: string;
  via: string;
  to: string;
  /** Solid accent for buttons, rings and the Android notification tint. */
  accent: string;
  /** Soft tint for backgrounds behind accent text. */
  soft: string;
}

export const OFFER_THEMES = {
  violet: { label: "Niramoy violet", from: "#4b25ab", via: "#6a3df0", to: "#a78bfa", accent: "#6a3df0", soft: "#f3f2ff" },
  sunset: { label: "Sunset", from: "#e11d48", via: "#f43f5e", to: "#fb923c", accent: "#f43f5e", soft: "#fff1f2" },
  emerald: { label: "Fresh green", from: "#047857", via: "#059669", to: "#34d399", accent: "#059669", soft: "#ecfdf5" },
  ocean: { label: "Ocean", from: "#075985", via: "#0284c7", to: "#22d3ee", accent: "#0284c7", soft: "#f0f9ff" },
  gold: { label: "Festive gold", from: "#b45309", via: "#d97706", to: "#fbbf24", accent: "#d97706", soft: "#fffbeb" },
  midnight: { label: "Midnight", from: "#0f172a", via: "#312e81", to: "#7c3aed", accent: "#4f46e5", soft: "#eef2ff" },
} satisfies Record<string, OfferTheme>;

export type OfferThemeKey = keyof typeof OFFER_THEMES;

export const offerTheme = (key?: string): OfferTheme =>
  OFFER_THEMES[(key && key in OFFER_THEMES ? key : "violet") as OfferThemeKey];

export const themeGradient = (t: OfferTheme, angle = 135) =>
  `linear-gradient(${angle}deg, ${t.from} 0%, ${t.via} 55%, ${t.to} 100%)`;
