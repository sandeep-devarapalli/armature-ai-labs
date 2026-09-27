import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestAvatar } from "../lib/avatar";
import { AccountAvatar } from "./AccountAvatar";
export function AvatarSettings({ client, userId, name }: {
    client: SupabaseClient;
    userId: string;
    name: string;
}) {
    const [consent, setConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    async function update(method: "POST" | "DELETE", file?: File) {
        if (method === "POST" && !consent)
            return;
        if (file && (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
            setMessage("Choose a PNG or JPEG of at most 5 MiB.");
            return;
        }
        setBusy(true);
        setMessage("");
        try {
            await requestAvatar(client, userId, method, file);
            window.dispatchEvent(new Event("armature-avatar-change"));
            setMessage(method === "DELETE" ? "Avatar removed." : "Avatar saved.");
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : "Avatar could not be updated.");
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="panel" aria-labelledby="avatar-settings-title">
    <h2 id="avatar-settings-title">Profile photo</h2>
    <AccountAvatar client={client} userId={userId} name={name} large/>
    <p>Your avatar is visible to approved members and authorised reviewers. A separate copy remains until you replace or remove it, or delete your account. Verification originals still expire after 30 days. Government ID images are never used.</p>
    <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy}/> I agree to use my photo as a retained member avatar.</label>
    <div className="button-row">
      <button className="button secondary" disabled={busy || !consent} onClick={() => void update("POST")}>Use submitted profile photo</button>
      <label>Upload or replace avatar <input type="file" accept="image/png,image/jpeg" disabled={busy || !consent} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file)
        void update("POST", file); }}/></label>
      <button className="button secondary" disabled={busy} onClick={() => void update("DELETE")}>Remove avatar</button>
    </div>
    <p role="status" aria-live="polite">{busy ? "Checking and saving…" : message}</p>
  </section>;
}
