import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestAvatar } from "../lib/avatar";
export function AccountAvatar({ client, userId, name, large = false }: {
    client: SupabaseClient;
    userId: string;
    name: string;
    large?: boolean;
}) {
    const [image, setImage] = useState<{
        userId: string;
        url: string;
    } | null>(null);
    useEffect(() => {
        let generation = 0;
        let disposed = false;
        let timer: number | undefined;
        let url: string | undefined;
        const clear = () => { if (url)
            URL.revokeObjectURL(url); url = undefined; setImage(null); };
        const refresh = async () => {
            if (disposed)
                return;
            const current = ++generation;
            clear();
            try {
                const blob = await requestAvatar(client, userId);
                if (current !== generation || !blob)
                    return;
                url = URL.createObjectURL(blob);
                setImage({ userId, url });
            }
            catch { /* Initials remain available when an image cannot be loaded. */ }
        };
        void refresh();
        const { data } = client.auth.onAuthStateChange(() => { generation++; clear(); window.clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 0); });
        window.addEventListener("armature-avatar-change", refresh);
        window.addEventListener("focus", refresh);
        window.addEventListener("armature:account-changed", refresh);
        const visibility = () => { if (document.visibilityState === "visible")
            void refresh(); };
        document.addEventListener("visibilitychange", visibility);
        return () => { disposed = true; window.clearTimeout(timer); generation++; if (url)
            URL.revokeObjectURL(url); data.subscription.unsubscribe(); window.removeEventListener("armature-avatar-change", refresh); window.removeEventListener("focus", refresh); window.removeEventListener("armature:account-changed", refresh); document.removeEventListener("visibilitychange", visibility); };
    }, [client, userId]);
    const className = `avatar${large ? " avatar-large" : ""}`;
    return image?.userId === userId ? <img className={className} src={image.url} alt={`${name} profile`}/> : <span className={className} aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "M"}</span>;
}
