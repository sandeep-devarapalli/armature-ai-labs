import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { analyticsConfigured, isAnalyticsPage, setAnalyticsConsent, trackPublicPageview } from "../lib/analytics";
import "./AnalyticsConsent.css";
const STORAGE_KEY = "armature-analytics-consent";
const SETTINGS_EVENT = "armature:analytics-settings";
type Preference = "granted" | "denied" | null;
function readPreference(): Preference {
  try { const value = localStorage.getItem(STORAGE_KEY); return value === "granted" || value === "denied" ? value : null; }
  catch { return null; }
}
export function AnalyticsSettingsButton() {
  if (!analyticsConfigured) return null;
  return <button className="analytics-settings-link" type="button" onClick={() => window.dispatchEvent(new Event(SETTINGS_EVENT))}>Analytics settings</button>;
}
export function AnalyticsConsent() {
  const { pathname } = useLocation();
  const [preference, setPreference] = useState<Preference>(readPreference);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const open = () => setSettingsOpen(true);
    const sync = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) setPreference(readPreference()); };
    window.addEventListener(SETTINGS_EVENT, open); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(SETTINGS_EVENT, open); window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => { setAnalyticsConsent(analyticsConfigured && preference === "granted"); }, [preference]);
  useEffect(() => { if (analyticsConfigured && preference === "granted") trackPublicPageview(pathname); }, [pathname, preference]);
  useEffect(() => { if (settingsOpen) dialog.current?.showModal(); else dialog.current?.close(); }, [settingsOpen]);
  if (!analyticsConfigured) return null;
  function choose(value: Exclude<Preference, null>) {
    // Stop measurement immediately, including while React updates the visible preference.
    setAnalyticsConsent(value === "granted");
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* The current-tab choice still applies when storage is unavailable. */ }
    setPreference(value); setSettingsOpen(false);
  }
  const content = <><h2 id={settingsOpen ? "analytics-dialog-title" : "analytics-banner-title"}>Optional website analytics</h2><p>With your permission, we use PostHog to count public page visits and anonymous registration steps. No profile or ID contents, personal details, or session recordings are collected. Processing is in the US.</p><p>You can change this choice at any time in Analytics settings. <Link to="/privacy#privacy-analytics" onClick={() => setSettingsOpen(false)}>Read our privacy notice</Link>.</p>{settingsOpen && <p role="status">Analytics is {preference === "granted" ? "allowed" : "off"} in this browser.</p>}<div className="analytics-consent-actions"><button className="button button-primary" type="button" onClick={() => choose("granted")}>Allow analytics</button><button className="button button-secondary" type="button" onClick={() => choose("denied")}>{preference === "granted" ? "Withdraw consent" : "No thanks"}</button>{settingsOpen && <button className="button button-quiet" type="button" onClick={() => setSettingsOpen(false)}>Close</button>}</div></>;
  return <>{!preference && !settingsOpen && isAnalyticsPage(pathname) && <section className="analytics-consent-banner" aria-labelledby="analytics-banner-title">{content}</section>}<dialog ref={dialog} className="analytics-consent-dialog" aria-labelledby="analytics-dialog-title" onClose={() => setSettingsOpen(false)}>{settingsOpen && content}</dialog></>;
}
