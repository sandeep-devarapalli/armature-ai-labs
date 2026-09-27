import { Link } from "react-router-dom";
import { useEquipmentWishlist } from "../context/EquipmentWishlist";
import "../pages/EquipmentWishlistPage.css";

export function WishlistSidebar({ query = "" }: { query?: string }) {
  const { rows, loading, error } = useEquipmentWishlist(0, query);
  return <aside className="wishlist-sidebar" aria-label="Equipment wishlist"><h2>What should we add next?</h2><p>Member requests help guide equipment planning. Votes are interest, not a purchase commitment.</p>
    {loading ? <p role="status">Loading equipment requests…</p> : error ? <p>{error}</p> : rows.length ? <ol>{rows.slice(0, 5).map(row => <li key={row.id}><Link to={`/components/wishlist?request=${row.id}`}>{row.component_name}</Link> · {row.vote_count} vote{row.vote_count === 1 ? "" : "s"}</li>)}</ol> : <p>{query.trim() ? "No matching equipment requests yet." : "No equipment requests have been published yet."}</p>}
    <Link className="button button-quiet" to={query.trim() ? `/components/wishlist?name=${encodeURIComponent(query.trim())}` : "/components/wishlist"}>{query.trim() ? "Request this equipment" : "Explore the equipment wishlist"}</Link>
  </aside>;
}
