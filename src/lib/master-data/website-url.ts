// 2026-10-20, user request: "on all logos displayed on the login screen, if a
// client has a website address filled in, allow when clicking the logo to take the
// user to the webpage". The website is free text in the company settings, so it is
// cleaned here before it is ever used as a link: only http/https addresses with a
// real host come out ("javascript:..." and the like become null).
export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
