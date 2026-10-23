"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the ad list is loaded from the server on mount */
import { useEffect, useRef, useState } from "react";

// 2026-10-23, user request: an advertising block above the Reports pane in every company's sidebar. A platform admin schedules
// supplier ads under Platform > Advertising; when no ad is live the block shows Flo X's own card. Several live ads take turns.
// Nothing is shown inside a platform support session, or for a company where ads are switched off (the server decides: it
// answers hidden = true). The list is refreshed every few minutes so a timeslot starting or ending is picked up without a reload.

type Ad = { id: string; advertiser: string; headline: string; body: string; buttonText: string; imageUrl: string | null };
const ROTATE_MS = 12000;
const REFRESH_MS = 5 * 60 * 1000;
const FLOX_URL = "https://www.floxintegrations.co.za";

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
    return () => { cancelled = true; clearInterval(timer); };
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
      <style>{STYLES}</style>
      {ad ? (
        <div className="sb-ad sb-ad-supplier" aria-label="Sponsored">
          <a className="sb-ad-img" href={`/api/v1/ads/${ad.id}/click`} target="_blank" rel="noopener noreferrer sponsored">
            {ad.imageUrl ? <img src={ad.imageUrl} alt={ad.advertiser} /> : <span>{ad.advertiser}</span>}
            <em>Sponsored</em>
          </a>
          <div className="sb-ad-body">
            <b>{ad.headline}</b>
            {ad.body ? <p>{ad.body}</p> : null}
            <a className="sb-ad-cta" href={`/api/v1/ads/${ad.id}/click`} target="_blank" rel="noopener noreferrer sponsored">{ad.buttonText}</a>
            {ads.length > 1 ? <div className="sb-ad-dots" aria-hidden="true">{ads.map((a, i) => <i key={a.id} className={i === index % ads.length ? "on" : ""} />)}</div> : null}
            <small>Ad · Flo X Integrations</small>
          </div>
        </div>
      ) : (
        <div className="sb-ad sb-ad-flox">
          <div className="sb-ad-tag">Flo X</div>
          <div className="sb-ad-brand"><span>FX</span><b>Flo X Integrations</b></div>
          <p>Modular management software for workshops. Need another module?</p>
          <a className="sb-ad-gold" href={FLOX_URL} target="_blank" rel="noopener noreferrer">Talk to us</a>
        </div>
      )}
    </>
  );
}

const STYLES = `
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
.sb-ad-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
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
