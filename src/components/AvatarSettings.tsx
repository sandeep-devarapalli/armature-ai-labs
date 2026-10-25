import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestAvatar, requestVerificationPhoto } from "../lib/avatar";
import { documentAvailable, type LocalDocument } from "../lib/onboarding";
import "./AvatarSettings.css";

type Photo = { state: "loading" | "ready" | "image-error" | "status-error"; saved: boolean | null; url: string | null };
type Draft = { file: File; url: string };
export function AvatarSettings({ client, userId, name, verificationPhoto = null, onBusyChange }: {
    client: SupabaseClient; userId: string; name: string; verificationPhoto?: LocalDocument | null; onBusyChange?: (busy: boolean) => void;
}) {
    return <MemberPhoto key={userId} client={client} userId={userId} name={name} verificationPhoto={verificationPhoto} onBusyChange={onBusyChange} />;
}
function MemberPhoto({ client, userId, name, verificationPhoto, onBusyChange }: {
    client: SupabaseClient; userId: string; name: string; verificationPhoto: LocalDocument | null; onBusyChange?: (busy: boolean) => void;
}) {
    const [photo, setPhoto] = useState<Photo>({ state: "loading", saved: null, url: null });
    const [phase, setPhase] = useState<"view" | "choose" | "edit" | "remove">("view");
    const [draft, setDraft] = useState<Draft | null>(null), [consent, setConsent] = useState(false);
    const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
    const [activeAccount, setActiveAccount] = useState(true);
    const epoch = useRef(0), loadVersion = useRef(0), selection = useRef(0), operation = useRef(false);
    const urls = useRef(new Set<string>()), currentUrl = useRef<string | null>(null), draftUrl = useRef<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null), phaseHeading = useRef<HTMLHeadingElement>(null), changeButton = useRef<HTMLButtonElement>(null), removeButton = useRef<HTMLButtonElement>(null);
    const sourceAvailable = verificationPhoto?.user_id === userId && verificationPhoto.kind === "photo" && Boolean(verificationPhoto.uploaded_at) && documentAvailable(verificationPhoto);
    const release = (url: string | null) => { if (url && urls.current.delete(url)) URL.revokeObjectURL(url); };
    const clearDraft = () => { selection.current++; release(draftUrl.current); draftUrl.current = null; setDraft(null); setConsent(false); };
    const clearImages = () => { for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); currentUrl.current = null; draftUrl.current = null; };
    async function loadPhoto() {
        const account = epoch.current, version = ++loadVersion.current;
        const current = () => account === epoch.current && version === loadVersion.current;
        setPhoto(value => ({ ...value, state: "loading" }));
        try {
            const { data: { session } } = await client.auth.getSession();
            if (!current()) return;
            if (session?.user.id !== userId) throw new Error("Sign in to your account again.");
            const { data, error: metadataError } = await client.from("member_avatars").select("updated_at").eq("user_id", userId).maybeSingle();
            if (!current()) return;
            if (metadataError) throw metadataError;
            if (!data) { release(currentUrl.current); currentUrl.current = null; setPhoto({ state: "ready", saved: false, url: null }); return; }
            try {
                const blob = await requestAvatar(client, userId);
                if (!current()) return;
                release(currentUrl.current); currentUrl.current = null;
                if (!blob) { setPhoto({ state: "image-error", saved: true, url: null }); return; }
                const url = URL.createObjectURL(blob); urls.current.add(url); currentUrl.current = url;
                setPhoto({ state: "ready", saved: true, url });
            } catch { if (current()) { release(currentUrl.current); currentUrl.current = null; setPhoto({ state: "image-error", saved: true, url: null }); } }
        } catch { if (current()) setPhoto(value => ({ ...value, state: "status-error" })); }
    }
    useEffect(() => {
        void loadPhoto();
        const { data } = client.auth.onAuthStateChange((_event, session) => {
            if (session?.user.id !== userId) {
                epoch.current++; loadVersion.current++; operation.current = false; selection.current++; clearImages();
                setDraft(null); setConsent(false); setPhase("view"); setBusy(false); setNotice(""); setError("");
                setPhoto({ state: "loading", saved: null, url: null }); setActiveAccount(false);
            } else setActiveAccount(true);
        });
        const refresh = () => { if (!operation.current) void loadPhoto(); };
        window.addEventListener("armature-avatar-change", refresh);
        return () => { epoch.current++; selection.current++; data.subscription.unsubscribe(); window.removeEventListener("armature-avatar-change", refresh); clearImages(); };
    }, [client, userId]);
    useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
    useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
    useEffect(() => {
        if (phase === "view") return;
        const frame = requestAnimationFrame(() => { phaseHeading.current?.focus({ preventScroll: true }); phaseHeading.current?.scrollIntoView?.({ block: "start", behavior: "instant" }); });
        return () => cancelAnimationFrame(frame);
    }, [phase]);
    function choose() { clearDraft(); setError(""); setNotice(""); setPhase("choose"); }
    function cancel() { clearDraft(); setError(""); setNotice(""); setPhase("view"); requestAnimationFrame(() => changeButton.current?.focus()); }
    async function preview(file: File) {
        const account = epoch.current, version = ++selection.current;
        if (!["image/png", "image/jpeg"].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) { setError("Choose a PNG or JPEG of at most 5 MiB."); return; }
        const url = URL.createObjectURL(file); urls.current.add(url);
        try {
            const image = new Image(); image.src = url; await image.decode();
            if (account !== epoch.current || version !== selection.current) { release(url); return; }
            release(draftUrl.current); draftUrl.current = url; setDraft({ file, url }); setConsent(false); setError(""); setPhase("edit");
        } catch { release(url); if (account === epoch.current && version === selection.current) setError("This image could not be opened. Choose another PNG or JPEG."); }
    }
    async function useVerification() {
        if (!sourceAvailable || !verificationPhoto || operation.current) return;
        const account = epoch.current; operation.current = true; setBusy(true); setError("");
        try { const file = await requestVerificationPhoto(client, userId, verificationPhoto); if (account === epoch.current) await preview(file); }
        catch (reason) { if (account === epoch.current) setError(reason instanceof Error ? reason.message : "Your verification photo is unavailable for reuse. Upload a new profile photo."); }
        finally { if (account === epoch.current) { operation.current = false; setBusy(false); } }
    }
    async function save(remove = false) {
        if (operation.current || (!remove && (!draft || !consent))) return;
        const account = epoch.current; operation.current = true; setBusy(true); setError(""); setNotice("");
        try {
            await requestAvatar(client, userId, remove ? "DELETE" : "POST", remove ? undefined : draft!.file);
            window.dispatchEvent(new Event("armature-avatar-change"));
            if (account !== epoch.current) return;
            clearDraft(); setPhase("view"); setNotice(remove ? "Profile photo removed. Your initials are shown instead." : "Profile photo saved.");
            await loadPhoto();
            if (account === epoch.current) requestAnimationFrame(() => changeButton.current?.focus());
        } catch (reason) { if (account === epoch.current) setError(reason instanceof Error ? reason.message : "The change could not be confirmed. Retry photo status before trying again."); }
        finally { if (account === epoch.current) { operation.current = false; setBusy(false); } }
    }
    const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("") || "M";
    return <section className="panel member-photo-settings" aria-labelledby="avatar-settings-title">
        <div className="member-photo-title"><h2 id="avatar-settings-title">Member profile photo</h2><span>Optional</span></div>
        {!activeAccount ? <p role="status">Sign in to your account again to manage your photo.</p> : <>
        <div className="member-photo-current"><div className="member-photo-image">{photo.url ? <img src={photo.url} alt="Current member profile photo" onError={() => setPhoto(value => ({ ...value, state: "image-error", url: null }))} /> : <span aria-hidden="true">{initials}</span>}</div><div>
            <h3>{photo.state === "loading" ? "Loading your photo…" : photo.state === "status-error" ? "Photo status unavailable" : photo.state === "image-error" ? "Your saved photo" : photo.saved ? "Your current photo" : "No profile photo yet"}</h3>
            <p className="member-photo-status">{photo.state === "image-error" ? "Photo could not be loaded" : photo.state === "status-error" ? "We could not check your saved photo. Try again." : photo.state === "ready" ? photo.saved ? "Saved" : "Your initials are shown instead." : "Checking your saved photo."}</p>
            {photo.state === "image-error" && <p className="member-photo-help">Your saved photo has not been removed.</p>}
            {(photo.state === "image-error" || photo.state === "status-error") && <button className="member-photo-link" disabled={busy} onClick={() => void loadPhoto()}>Retry loading photo</button>}
        </div></div>
        <p className="member-photo-visibility">Visible to approved members and authorised reviewers. Kept until you replace or remove it, or delete your account.</p>
        {notice && <p className="member-photo-notice" role="status">{notice}</p>}{error && <p className="member-photo-error" role="alert">{error}</p>}
        {phase === "view" && <div><button ref={changeButton} className="button" disabled={busy || photo.state === "loading" || photo.state === "status-error"} onClick={choose}>{photo.saved ? "Change photo" : "Add a photo"}</button>{photo.saved && <p className="member-photo-remove"><button ref={removeButton} className="member-photo-link" disabled={busy || photo.state === "status-error"} onClick={() => { setNotice(""); setError(""); setPhase("remove"); }}>Remove saved photo</button></p>}</div>}
        {phase === "choose" && <div className="member-photo-workspace"><h3 ref={phaseHeading} tabIndex={-1}>Choose a photo</h3><p>{photo.saved ? "Your current photo stays in place until you save a replacement." : "Your initials stay in place until you save a photo."}</p>
            <div className="member-photo-sources"><button className="member-photo-source" disabled={busy} onClick={() => fileInput.current?.click()}><strong>Upload a new photo</strong><span>PNG or JPEG · up to 5 MiB</span></button>{sourceAvailable && <button className="member-photo-source" disabled={busy} onClick={() => void useVerification()}><strong>Use my verification photo</strong><span>Keep a separate copy as your member profile photo.</span></button>}</div>
            {!sourceAvailable && <p>Your verification photo is unavailable for reuse. You can upload a new profile photo.</p>}
            <input ref={fileInput} type="file" accept="image/png,image/jpeg" aria-label="Upload a new profile photo" hidden disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void preview(file); }} />
            {busy && <p role="status">Loading your verification photo…</p>}<button className="button secondary" disabled={busy} onClick={cancel}>Cancel</button>
        </div>}
        {phase === "edit" && draft && <div className="member-photo-workspace"><h3 ref={phaseHeading} tabIndex={-1}>Preview your new photo</h3><div className="member-photo-draft"><div className="member-photo-image"><img src={draft.url} alt="Selected photo preview" /></div><div><p>{draft.file.name}</p><p>{photo.saved ? "This image will replace your current member profile photo only when you save." : "This image becomes your member profile photo only when you save."}</p><button className="member-photo-link" disabled={busy} onClick={choose}>Choose a different photo</button></div></div>
            <label className="member-photo-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>Keep this image as my member profile photo until I replace or remove it, or delete my account.</span></label><p className="member-photo-help">{consent ? "Ready to save. Public sharing remains a separate choice." : "Confirm permission above to enable Save photo."}</p>
            <div className="member-photo-actions"><button className="button" disabled={busy || !consent} onClick={() => void save()}>{busy ? "Checking and saving…" : "Save photo"}</button><button className="button secondary" disabled={busy} onClick={cancel}>Cancel</button></div>
        </div>}
        {phase === "remove" && <div className="member-photo-workspace member-photo-confirm"><h3 ref={phaseHeading} tabIndex={-1}>Remove your saved profile photo?</h3><p>Your initials will be shown instead. Your identity approval stays the same. If this photo is shared on your public profile, it will stop displaying there too.</p><div className="member-photo-actions"><button className="button" disabled={busy} onClick={() => void save(true)}>{busy ? "Removing…" : "Remove photo"}</button><button className="button secondary" disabled={busy} onClick={() => { setError(""); setPhase("view"); requestAnimationFrame(() => removeButton.current?.focus()); }}>Keep photo</button></div></div>}
        <details className="member-photo-sharing"><summary>What about my public member profile?</summary><p>Saving a member photo here does not publish it. Public sharing is a separate choice for each photo, managed in <Link to="/directory-profile">My public profile</Link>.</p></details>
        <p className="member-photo-help">This photo is optional. You can continue verification without adding one.</p>
        </>}
    </section>;
}
