import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export function useBookingInventory() {
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!supabase) return;
    void supabase.from("booking_inventory").select("resource_id").then(result => {
      if (!active) return;
      if (result.error) setError("Booking inventory could not be checked. Reload before booking.");
      else setIds((result.data ?? []).map(row => row.resource_id));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);
  return { ids, loading, error };
}
