"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the ad list is loaded from the server on mount */
import { useEffect, useRef, useState } from "react";

// 2026-10-23, user request: an advertising block above the Reports pane in every company's sidebar. A platform admin schedules
// supplier ads under Platform > Advertising; when no ad is live the block shows Flo X's own card. Several live ads take turns.
// Nothing is shown inside a platform support session, or for a company where ads are switched off (the server decides: it
// answers hidden = true). The list is refreshed every minute (and when the browser tab is shown again) so a timeslot starting or ending is picked up without a reload.

export type Ad = { id: string; advertiser: string; headline: string; body: string; buttonText: string; imageUrl: string | null };
const ROTATE_MS = 12000;
const REFRESH_MS = 60 * 1000; // a paused / changed ad disappears from the sidebar within a minute (and when the tab is shown again)
const FLOX_URL = "https://www.floxintegrations.co.za";

/** The supplier ad card, shared by the sidebar and the platform's Advertising preview (preview = links do nothing). */
export function SupplierAdCard({ ad, href, dots, preview = false }: { ad: Ad; href: string; dots?: { index: number; ids: string[] }; preview?: boolean }) {
  // Only a picture (no headline, text or button): show the picture alone, scaled whole to the sidebar, all of it the link.
  const imageOnly = Boolean(ad.imageUrl) && !ad.headline && !ad.body && !ad.buttonText;
  const linkProps = { href: preview ? "#" : href, target: preview ? undefined : "_blank", rel: "noopener noreferrer sponsored", onClick: preview ? (e: React.MouseEvent) => e.preventDefault() : undefined };
  const dotRow = dots ? dots.ids.map((id, i) => <i key={id} className={i === dots.index ? "on" : ""} />) : null;
  if (imageOnly) {
    return (
      <div className="sb-ad sb-ad-photo" aria-label="Sponsored">
        <a {...linkProps} title={ad.advertiser}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ad pictures come from our own API, sizes are unknown */}
          <img src={ad.imageUrl ?? ""} alt={ad.advertiser} />
          <em>Sponsored</em>
        </a>
        {dotRow ? <div className="sb-ad-dots on-photo" aria-hidden="true">{dotRow}</div> : null}
      </div>
    );
  }
  return (
    <div className="sb-ad sb-ad-supplier" aria-label="Sponsored">
      <a className={`sb-ad-img${ad.imageUrl ? " has-img" : ""}`} {...linkProps}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ad pictures come from our own API, sizes are unknown */}
        {ad.imageUrl ? <img src={ad.imageUrl} alt={ad.advertiser} /> : <span>{ad.advertiser}</span>}
        <em>Sponsored</em>
      </a>
      <div className="sb-ad-body">
        {ad.headline ? <b>{ad.headline}</b> : null}
        {ad.body ? <p>{ad.body}</p> : null}
        {ad.buttonText ? <a className="sb-ad-cta" {...linkProps}>{ad.buttonText}</a> : null}
        {dotRow ? <div className="sb-ad-dots" aria-hidden="true">{dotRow}</div> : null}
        <small>Ad · Flo X Integrations</small>
      </div>
    </div>
  );
}

export function FloxAdCard() {
  return (
    <div className="sb-ad sb-ad-flox">
      <div className="sb-ad-tag">Flo X</div>
      <div className="sb-ad-brand"><span>FX</span><b>Flo X Integrations</b></div>
      <p>Modular management software for workshops. Need another module?</p>
      <a className="sb-ad-gold" href={FLOX_URL} target="_blank" rel="noopener noreferrer">Talk to us</a>
    </div>
  );
}

export function SidebarAd() {
  const [state, setState] = useState<{ hidden: boolean; ads: Ad[] } | null>(null);
  const [index, setIndex] = useState(0);
  const counted = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/v1/ads/current", { cache: "no-store" });
        if (!r.ok) return;
        const body = (await r.json()) as { hidden: boolean; ads: Ad[] };
        if (!cancelled) setState(body);
      } catch {
        /* an ad block that cannot load simply stays as it was */
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const onShow = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  const ads = state?.ads ?? [];
  useEffect(() => {
    if (ads.length < 2) { setIndex(0); return; }
    const timer = setInterval(() => setIndex((i) => (i + 1) % ads.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [ads.length]);

  const ad = ads.length ? ads[index % ads.length] : null;
  useEffect(() => {
    if (!ad || counted.current.has(ad.id)) return;
    counted.current.add(ad.id);
    void fetch(`/api/v1/ads/${ad.id}/view`, { method: "POST" }).catch(() => undefined);
  }, [ad]);

  if (!state || state.hidden) return null;
  return (
    <>
      <style>{SIDEBAR_AD_STYLES}</style>
      {ad ? (
        <SupplierAdCard ad={ad} href={`/api/v1/ads/${ad.id}/click`} dots={ads.length > 1 ? { index: index % ads.length, ids: ads.map((x) => x.id) } : undefined} />
      ) : (
        <FloxAdCard />
      )}
    </>
  );
}

export const SIDEBAR_AD_STYLES = `
.sb-ad{margin:0 0 10px;border-radius:10px;overflow:hidden}
.sb-ad-flox{padding:12px;background:linear-gradient(145deg,#12315c,#0c1a2c);border:1px solid rgba(255,255,255,.1)}
.sb-ad-tag{font-size:8.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8ba0bd}
.sb-ad-brand{display:flex;align-items:center;gap:10px;margin:9px 0 6px}
.sb-ad-brand span{display:grid;flex:none;width:34px;height:34px;place-items:center;border-radius:9px;background:#2674df;color:#fff;font-size:12px;font-weight:900}
.sb-ad-brand b{color:#fff;font-size:13px}
.sb-ad-flox p{margin:0;color:#9db0c9;font-size:11px;line-height:1.4}
.sb-ad-gold{display:block;margin-top:9px;padding:7px;border-radius:7px;background:#d6a83b;color:#1c1405!important;font-size:11px;font-weight:800;text-align:center;text-decoration:none}
.sb-ad-gold:hover{background:#e0b74f}
.sb-ad-supplier{background:#fff;color:#0c1a2c}
.sb-ad-img{position:relative;display:flex;height:84px;align-items:flex-end;overflow:hidden;background:linear-gradient(120deg,#2674df,#12315c);text-decoration:none}
.sb-ad-img.has-img{display:block;height:auto;background:#f3f5f9}
.sb-ad-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sb-ad-img.has-img img{position:static;display:block;width:100%;height:auto;max-height:150px;object-fit:contain}
.sb-ad-photo{position:relative;background:#fff;border:1px solid rgba(255,255,255,.12)}
.sb-ad-photo a{position:relative;display:block;text-decoration:none}
.sb-ad-photo img{display:block;width:100%;height:auto;max-height:210px;object-fit:contain;margin:0 auto}
.sb-ad-photo em{position:absolute;top:6px;left:7px;padding:2px 5px;border-radius:3px;background:rgba(0,0,0,.45);color:#fff;font-size:8px;font-style:normal;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.sb-ad-dots.on-photo{position:absolute;right:0;bottom:5px;left:0;margin:0;pointer-events:none}
.sb-ad-img span{position:relative;padding:8px 10px;color:#fff;font-size:17px;font-weight:900;line-height:1.05;letter-spacing:-.01em}
.sb-ad-img em{position:absolute;top:7px;left:9px;padding:2px 5px;border-radius:3px;background:rgba(0,0,0,.45);color:#fff;font-size:8px;font-style:normal;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.sb-ad-body{padding:9px 11px 10px}
.sb-ad-body b{display:block;font-size:12.5px;line-height:1.25}
.sb-ad-body p{margin:3px 0 8px;color:#556;font-size:11px;line-height:1.35}
.sb-ad-cta{display:block;margin-top:8px;padding:7px;border-radius:7px;background:#155fca;color:#fff!important;font-size:11px;font-weight:800;text-align:center;text-decoration:none}
.sb-ad-cta:hover{background:#0d4fae}
.sb-ad-body small{display:block;margin-top:7px;color:#8a95a5;font-size:9px;text-align:center}
.sb-ad-dots{display:flex;justify-content:center;gap:4px;margin-top:8px}.sb-ad-dots i{width:14px;height:3px;border-radius:2px;background:#cfd6e1}.sb-ad-dots i.on{background:#d6a83b}
@media (max-height:760px){.sb-ad-body p,.sb-ad-flox p{display:none}.sb-ad-img{height:60px}}
@media print{.sb-ad{display:none}}
`;
