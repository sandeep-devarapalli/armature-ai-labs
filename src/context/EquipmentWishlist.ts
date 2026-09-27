import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "./AccountContext";
import { listEquipmentWishes, listMyWishVotes, type EquipmentWish } from "../lib/equipmentWishlist";

export function useEquipmentWishlist(page = 0, search = "", status = "", category = "", sort = "votes", requestId = "") {
  const { account } = useAccount();
  const [rows, setRows] = useState<EquipmentWish[]>([]);
  const [votes, setVotes] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError(""); setVotes([]);
    try {
      const result = await listEquipmentWishes(page, search, status, category, sort, requestId);
      const myVotes = account ? await listMyWishVotes(account.user_id) : [];
      if (request !== generation.current) return;
      setRows(result.rows); setCount(result.count); setVotes(myVotes);
    } catch { if (request === generation.current) { setRows([]); setCount(0); setError("The wishlist is temporarily unavailable. Please try again."); } }
    finally { if (request === generation.current) setLoading(false); }
  }, [account?.user_id, page, search, status, category, sort, requestId]);
  useEffect(() => { void refresh(); return () => { ++generation.current; }; }, [refresh]);
  return { rows, count, votes, loading, error, refresh };
}
