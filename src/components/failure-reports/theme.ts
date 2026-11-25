// Colour rules for a report, carried over unchanged from the Failure Report Builder (v8): the profile's accent and dark
// colours, made readable on white and on each other. Pure - used by the screens (preview) and the .pptx builder.

export const hx = (v: unknown): string | null => {
  let s = String(v ?? "").replace("#", "").trim();
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : null;
};
const rgbOf = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
export const hexOf = (a: number[]) => a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
export const lum = (h: string) => {
  const c = rgbOf(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const mix = (a: string, b: string, t: number) => { const A = rgbOf(a), B = rgbOf(b); return hexOf(A.map((v, i) => v + (B[i] - v) * t)); };
export const onColour = (bg: string) => (contrast(bg, "FFFFFF") >= contrast(bg, "111111") ? "FFFFFF" : "111111");
export function readableOn(fg: string, bg: string, min: number) {
  let c = fg;
  for (let i = 0; i < 20 && contrast(c, bg) < min; i++) c = mix(c, lum(bg) > 0.5 ? "000000" : "FFFFFF", 0.12);
  return c;
}
export const rgbDist = (a: string, b: string) => { const A = rgbOf(a), B = rgbOf(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };

export type ProfileLike = {
  name: string; legalName?: string | null; logoData: string | null; logoAspect: number; logoDark: boolean;
  accent: string; dark: string; accentText?: string | null; headerStyle: "auto" | "light" | "band";
  details: { address: string; phone: string; email: string; website: string; coreg: string; vat: string; extra: string };
  footer: string; showDetails: boolean;
};

export type ReportTheme = {
  accent: string; dark: string; title: string; accentText: string; onDark: string; onAccent: string; naFill: string; naText: string;
  band: boolean; accentOnDark: string; subOnDark: string; logo: { data: string; ar: number; dark: boolean } | null;
};

export function themeOf(p: ProfileLike): ReportTheme {
  const accent = hx(p.accent) || "F0B429", dark = hx(p.dark) || "14213D";
  const lg = p.logoData ? { data: p.logoData, ar: p.logoAspect || 1.4, dark: !!p.logoDark } : null;
  const band = p.headerStyle === "band" || (p.headerStyle !== "light" && !!(lg && lg.dark));
  const title = readableOn(dark, "FFFFFF", 4.5);
  const accentText = hx(p.accentText) || readableOn(mix(accent, "000000", 0.18), "FFFFFF", 4.5);
  const clash = rgbDist(accent, "DC2626") < 110 || rgbDist(accent, "16A34A") < 110; // N/A must not look like DECLINED / GRANTED
  const naFill = clash ? dark : accent;
  const onAcc = (c: string) => (contrast(c, dark) >= 4.5 ? dark : onColour(c)); // the brand's dark colour on the accent when readable
  return {
    accent, dark, title, accentText, onDark: onColour(dark), onAccent: onAcc(accent), naFill, naText: naFill === dark ? onColour(dark) : onAcc(naFill), band,
    accentOnDark: contrast(accent, dark) >= 3 ? accent : onColour(dark), subOnDark: mix(onColour(dark), dark, 0.3), logo: lg,
  };
}

/** The builder's default profile colours (Black Rock), used before any profile is loaded. */
export const FALLBACK_PROFILE: ProfileLike = {
  name: "Company", legalName: "", logoData: null, logoAspect: 1.4, logoDark: false, accent: "F0B429", dark: "14213D", accentText: null, headerStyle: "light",
  details: { address: "", phone: "", email: "", website: "", coreg: "", vat: "", extra: "" }, footer: "", showDetails: false,
};
