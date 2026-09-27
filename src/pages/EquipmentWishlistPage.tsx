import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, Field, PageHeader, Section, Status } from "../components/Primitives";
import { useAccount } from "../context/AccountContext";
import { useEquipmentWishlist } from "../context/EquipmentWishlist";
import { listEquipmentWishes, listPrivateEquipmentWishes, readPrivateWishImage, resolveMergedWish, wishlistCatalogue, uploadWishImage, wishRpc, wishlistImageUrl, wishlistStatuses, type EquipmentWish, type PrivateEquipmentWish } from "../lib/equipmentWishlist";
import "./EquipmentWishlistPage.css";

const label = (value: string) => value.replaceAll("_", " ");
const message = (reason: unknown) => reason instanceof Error ? reason.message : "The change could not be saved. Please try again.";
function Pagination({ page, count, setPage }: { page: number; count: number; setPage: (page: number) => void }) {
  return <nav className="wishlist-pagination" aria-label="Wishlist pages"><button className="button button-quiet" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</button><span>Page {page + 1} · {count} requests</span><button className="button button-quiet" disabled={(page + 1) * 20 >= count} onClick={() => setPage(page + 1)}>Next page</button></nav>;
}
function ImageUpload({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const file = data.get("image"); if (!(file instanceof File) || !file.size || data.get("rights") !== "on") return;
    setBusy(true); setError("");
    try { await uploadWishImage(id, file); form.reset(); onSaved(); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  return <form className="wishlist-image-form" onSubmit={event => void submit(event)}><Field label="Reference image" hint="JPEG, PNG or WebP, up to 5 MB. Images are scanned and metadata removed before acceptance."><input type="file" name="image" accept="image/jpeg,image/png,image/webp" required disabled={busy} /></Field><label className="wishlist-check"><input type="checkbox" name="rights" required disabled={busy} /> I own this image or have permission to share it.</label><button className="button button-quiet" disabled={busy}>{busy ? "Checking image…" : "Upload reference image"}</button>{error && <p role="alert">{error}</p>}</form>;
}

function PrivateImage({ id, name }: { id: string; name: string }) {
  const { account } = useAccount();
  const [src, setSrc] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = ""; setSrc(""); setError("");
    void readPrivateWishImage(id, controller.signal).then(blob => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); } }).catch(() => { if (!controller.signal.aborted) setError("Reference image unavailable. Reload to retry."); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, account?.user_id, account?.role]);
  return src ? <img className="wishlist-private-image" src={src} alt={`${name} submitted reference`} /> : <p>{error || "Loading reference image…"}</p>;
}

export function EquipmentWishlistPage() {
  const { account, signedIn, loading: accountLoading } = useAccount();
  const approved = account?.status === "approved";
  const admin = account?.role === "admin" || account?.role === "super_admin";
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(0), [search, setSearch] = useState(""), [status, setStatus] = useState("");
  const [category, setCategory] = useState(""), [sort, setSort] = useState("votes");
  const requestId = params.get("request") ?? "";
  const [draftName, setDraftName] = useState(params.get("name")?.slice(0, 160) ?? ""), [similar, setSimilar] = useState<EquipmentWish[]>([]);
  const feed = useEquipmentWishlist(page, search, status, category, sort, requestId);
  const [own, setOwn] = useState<PrivateEquipmentWish[]>([]), [ownPage, setOwnPage] = useState(0), [ownCount, setOwnCount] = useState(0);
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true; setOwn([]); setOwnCount(0);
    if (account) void listPrivateEquipmentWishes(account.user_id, false, ownPage).then(result => { if (active) { setOwn(result.rows); setOwnCount(result.count); } }).catch(reason => { if (active) setError(message(reason)); });
    return () => { active = false; };
  }, [account?.user_id, ownPage, revision]);
  useEffect(() => { setError(""); setNotice(""); setOwnPage(0); }, [account?.user_id]);
  useEffect(() => {
    let active = true;
    if (requestId) void resolveMergedWish(requestId).then(target => { if (active && target) { setParams({ request: target }, { replace: true }); setNotice("This request was merged into the equipment request shown below."); } }).catch(reason => { if (active) setError(message(reason)); });
    return () => { active = false; };
  }, [requestId, setParams]);
  useEffect(() => {
    let active = true; setSimilar([]);
    const timer = setTimeout(() => { if (draftName.trim().length >= 3) void listEquipmentWishes(0, draftName).then(result => { if (active) setSimilar(result.rows.slice(0, 5)); }).catch(() => {}); }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [draftName]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!approved) return;
    const form = event.currentTarget, data = new FormData(form); setBusy(true); setError(""); setNotice("");
    try {
      await wishRpc("submit_equipment_wish", { p_name: String(data.get("name")), p_use_case: String(data.get("use")), p_category: String(data.get("category")), p_model: String(data.get("model") || "") || null, p_vendor_url: String(data.get("url") || "") || null, p_quantity: Number(data.get("quantity")), p_budget: String(data.get("budget")) });
      form.reset(); setDraftName(""); setOwnPage(0); setRevision(value => value + 1); setNotice("Request saved for admin review. You can add an optional reference image under Your requests.");
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function vote(id: string, enabled: boolean) {
    if (!approved) return; setBusy(true); setError("");
    try { await wishRpc("vote_component_request", { p_request_id: id, p_enabled: enabled }); await feed.refresh(); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeader meta="Equipment wishlist · member priorities" title="What should we build with next?" description="Suggest equipment that would help a real project. Approved basic members can support published requests with one vote each, or withdraw their vote. Admins review fit and sourcing; votes do not promise a purchase." actions={<><Link className="button button-quiet" to="/components">Browse equipment</Link>{admin && <Link className="button button-quiet" to="/admin/equipment-wishlist">Moderate wishlist</Link>}</>} />
    <Section number="01" title="Member priorities"><form className="wishlist-filters" onSubmit={event => event.preventDefault()}><Field label="Search equipment requests"><input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></Field><Field label="Request status"><select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="">All statuses</option>{wishlistStatuses.map(value => <option value={value} key={value}>{label(value)}</option>)}</select></Field><Field label="Equipment category"><select value={category} onChange={event => { setCategory(event.target.value); setPage(0); }}><option value="">All categories</option>{["Robotics","Compute","Fabrication","Sensors","Electronics","Tools","Other"].map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Sort requests"><select value={sort} onChange={event => { setSort(event.target.value); setPage(0); }}><option value="votes">Most supported</option><option value="newest">Newest first</option></select></Field></form>{requestId && <Link to="/components/wishlist">Show all requests</Link>}
      {feed.loading ? <p role="status">Loading requests…</p> : feed.error ? <div role="alert"><p>{feed.error}</p><button className="button button-quiet" onClick={() => void feed.refresh()}>Retry wishlist</button></div> : !feed.rows.length ? <EmptyState title="No published requests yet">Suggest the equipment you need below. Requests appear after admin review.</EmptyState> : <div className="wishlist-list">{feed.rows.map(row => <article id={row.id} key={row.id}>{row.has_image && <img src={wishlistImageUrl(row.id)} alt={`${row.component_name} reference`} loading="lazy" />}<div><Status>{label(row.wishlist_status)}</Status><h3>{row.component_name}</h3><p>{row.wishlist_category}{row.wishlist_model ? ` · ${row.wishlist_model}` : ""}</p><p>{row.project_use_case}</p><p>Requested quantity: {row.requested_quantity}</p>{row.public_note && <p>{row.public_note}</p>}{row.linked_component_slug && <p><Link to={`/components/${row.linked_component_slug}`}>View in equipment catalogue</Link></p>}<p><Link to={`/components/wishlist?request=${row.id}`}>Link to this request</Link></p>{row.vendor_url && <a href={row.vendor_url} target="_blank" rel="noreferrer">Product reference</a>}</div><div><strong>{row.vote_count} vote{row.vote_count === 1 ? "" : "s"}</strong>{approved && <button className="button button-quiet" disabled={busy || (!feed.votes.includes(row.id) && ["available", "not_proceeding"].includes(row.wishlist_status))} onClick={() => void vote(row.id, !feed.votes.includes(row.id))}>{feed.votes.includes(row.id) ? "Withdraw vote" : ["available", "not_proceeding"].includes(row.wishlist_status) ? "Voting closed" : "Support request"}</button>}</div></article>)}</div>}
      {feed.count > 20 && <Pagination page={page} count={feed.count} setPage={setPage} />}
      {!accountLoading && !approved && <p>{signedIn ? <>An approved basic membership is needed to suggest or support equipment. <Link to="/onboarding">View your registration</Link>.</> : <><Link to="/auth?next=%2Fcomponents%2Fwishlist">Sign in</Link> with an approved basic membership to suggest or support equipment.</>}</p>}
    </Section>
    {approved && <Section number="02" title="Suggest equipment"><form className="profile-form" onSubmit={event => void submit(event)}><div className="form-grid"><Field label="Equipment name"><input name="name" value={draftName} onChange={event => setDraftName(event.target.value)} required maxLength={160} disabled={busy} /></Field><Field label="Category"><select name="category" disabled={busy}>{["Robotics", "Compute", "Fabrication", "Sensors", "Electronics", "Tools", "Other"].map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Brand or model (optional)"><input name="model" maxLength={160} disabled={busy} /></Field><Field label="Product URL (optional)"><input name="url" type="url" placeholder="https://" disabled={busy} /></Field><Field label="Quantity"><input name="quantity" type="number" defaultValue={1} min={1} max={500} required disabled={busy} /></Field><Field label="Budget estimate"><select name="budget" defaultValue="unknown" disabled={busy}><option value="unknown">Unknown</option><option value="under_2500">Under ₹2,500</option><option value="2500_to_10000">₹2,500–₹10,000</option><option value="10000_to_50000">₹10,000–₹50,000</option><option value="over_50000">Over ₹50,000</option></select></Field></div><Field label="What would you build or test?" hint="This explanation becomes public after review. Do not include private contact details."><textarea name="use" rows={4} required maxLength={1200} disabled={busy} /></Field>{similar.length > 0 && <aside><h3>Similar published requests</h3><p>Support an existing request if it covers your needs.</p><ul>{similar.map(item => <li key={item.id}><Link to={`/components/wishlist?request=${item.id}`}>{item.component_name}</Link></li>)}</ul></aside>}<button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Submit for review"}</button></form></Section>}
    {account && <Section number="03" title="Your requests">{own.length ? own.map(row => <article className="wishlist-own" key={row.id}><h3>{row.component_name}</h3><p>{row.merged_into ? "Merged into another equipment request" : row.is_published ? label(row.wishlist_status) : "Awaiting admin review"}</p>{approved && !row.is_published && !row.merged_into && <ImageUpload id={row.id} onSaved={() => setNotice("Reference image accepted for admin review.")} />}</article>) : <p>You have not submitted any equipment requests.</p>}{ownCount > 20 && <Pagination page={ownPage} count={ownCount} setPage={setOwnPage} />}</Section>}
    {error && <p className="wrap form-error" role="alert">{error}</p>}{notice && <p className="wrap success-message" role="status">{notice}</p>}
  </>;
}

export function AdminEquipmentWishlistPage() {
  const { account, loading } = useAccount();
  const allowed = account?.role === "admin" || account?.role === "super_admin";
  const [rows, setRows] = useState<PrivateEquipmentWish[]>([]), [count, setCount] = useState(0), [page, setPage] = useState(0), [revision, setRevision] = useState(0);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [targetSearch, setTargetSearch] = useState(""), [targets, setTargets] = useState<EquipmentWish[]>([]);
  const [catalogue, setCatalogue] = useState<{slug:string;name:string}[]>([]);
  useEffect(() => { let active = true; if (allowed) void wishlistCatalogue().then(data => { if (active) setCatalogue(data); }).catch(reason => { if (active) setError(message(reason)); }); return () => { active = false; }; }, [allowed]);
  useEffect(() => { let active = true; setTargets([]); if (allowed) void listEquipmentWishes(0, targetSearch).then(result => { if (active) setTargets(result.rows); }).catch(reason => { if (active) setError(message(reason)); }); return () => { active = false; }; }, [allowed, targetSearch, revision]);
  useEffect(() => { let active = true; setRows([]); if (allowed && account) void listPrivateEquipmentWishes(account.user_id, true, page).then(result => { if (active) { setRows(result.rows); setCount(result.count); } }).catch(reason => { if (active) setError(message(reason)); }); return () => { active = false; }; }, [allowed, account?.user_id, page, revision]);
  async function act(event: FormEvent<HTMLFormElement>, row: PrivateEquipmentWish, merge: boolean) {
    event.preventDefault(); if (!allowed) return; const data = new FormData(event.currentTarget);
    const target = targets.find(item => item.id === data.get("target"));
    if (merge && (!target || !window.confirm(`Merge “${row.component_name}” into “${target.component_name}”? Votes are combined without duplicates and the source is hidden.`))) return;
    setBusy(true); setError(""); setNotice("");
    try { await wishRpc(merge ? "merge_equipment_wishes" : "moderate_equipment_wish", merge ? { p_source_id: row.id, p_target_id: target!.id, p_note: String(data.get("note")) } : { p_request_id: row.id, p_publish: data.get("published") === "on", p_status: String(data.get("status")), p_note: String(data.get("note")), p_public_note: String(data.get("publicNote") || "") || null, p_component_slug: String(data.get("component") || "") || null }); setRevision(value => value + 1); setNotice(merge ? "Requests merged." : "Review saved."); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function edit(event: FormEvent<HTMLFormElement>, row: PrivateEquipmentWish) {
    event.preventDefault(); if (!allowed) return; const data = new FormData(event.currentTarget); setBusy(true); setError("");
    try { await wishRpc("edit_equipment_wish", { p_request_id: row.id, p_name: String(data.get("name")), p_use_case: String(data.get("use")), p_category: String(data.get("category")), p_vendor_url: String(data.get("url") || "") || null, p_quantity: Number(data.get("quantity")), p_budget: row.budget_band, p_model: String(data.get("model") || "") || null }); setRevision(value => value + 1); setNotice("Request details updated."); }
    catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }
  if (loading) return <p className="wrap" role="status">Checking admin access…</p>;
  if (!allowed) return <PageHeader title="Admin access required." description="Only Admins and Super admins can moderate equipment requests. Membership-review Staff do not have access." />;
  return <><PageHeader meta="Equipment wishlist · administration" title="Review equipment requests." description="Publish relevant requests, record purchasing progress and combine duplicates. No purchase or stock change is made here." actions={<Link to="/components/wishlist">Public wishlist</Link>} /><Section number="01" title="Request review"><Field label="Find a published merge target" hint="Search narrows the target lists below to up to 20 published requests, independently of this review page."><input type="search" value={targetSearch} onChange={event => setTargetSearch(event.target.value)} /></Field>{!rows.length && <p>No requests to review.</p>}{rows.map(row => <article className="wishlist-review" key={row.id}><h3>{row.component_name}</h3><p>{row.wishlist_category} · {row.wishlist_model}</p><p>{row.project_use_case}</p>{row.image_path && <PrivateImage id={row.id} name={row.component_name} />}{row.vendor_url && <a href={row.vendor_url} target="_blank" rel="noreferrer">Product reference</a>}{row.merged_into ? <p>Merged request</p> : <><form onSubmit={event => void act(event, row, false)}><Field label={`Status for ${row.component_name}`}><select name="status" defaultValue={row.wishlist_status} disabled={busy}>{wishlistStatuses.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></Field><label className="wishlist-check"><input type="checkbox" name="published" defaultChecked={row.is_published} disabled={busy} /> Publish {row.component_name}</label><Field label={`Review note for ${row.component_name}`} hint="Internal moderation note. Use the public explanation for information members should see."><textarea name="note" defaultValue={row.decision_note ?? ""} required maxLength={1000} minLength={2} disabled={busy} /></Field><Field label={`Public explanation for ${row.component_name}`}><textarea name="publicNote" defaultValue={row.public_note ?? ""} maxLength={1000} disabled={busy} /></Field><Field label={`Catalogue item for ${row.component_name}`} hint="Required when marking equipment Available."><select name="component" defaultValue={row.linked_component_slug ?? ""} disabled={busy}><option value="">Not linked</option>{catalogue.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></Field><button className="button button-primary" disabled={busy}>Save review</button></form><details><summary>Edit request details</summary><form onSubmit={event => void edit(event, row)}><Field label={`Equipment name for ${row.component_name}`}><input name="name" defaultValue={row.component_name} required minLength={2} maxLength={160} disabled={busy} /></Field><Field label={`Use case for ${row.component_name}`}><textarea name="use" defaultValue={row.project_use_case} required minLength={10} maxLength={1200} disabled={busy} /></Field><Field label={`Category for ${row.component_name}`}><input name="category" defaultValue={row.wishlist_category} required minLength={2} maxLength={80} disabled={busy} /></Field><Field label={`Model for ${row.component_name}`}><input name="model" defaultValue={row.wishlist_model ?? ""} maxLength={160} disabled={busy} /></Field><Field label={`Product URL for ${row.component_name}`}><input name="url" type="url" defaultValue={row.vendor_url ?? ""} disabled={busy} /></Field><Field label={`Quantity for ${row.component_name}`}><input name="quantity" type="number" min={1} max={500} defaultValue={row.requested_quantity} disabled={busy} /></Field><button className="button button-quiet" disabled={busy}>Save request details</button></form></details><details><summary>Merge duplicate</summary><form onSubmit={event => void act(event, row, true)}><Field label={`Merge ${row.component_name} into`}><select name="target" required disabled={busy}><option value="">Select a published request</option>{targets.filter(target => target.id !== row.id).map(target => <option value={target.id} key={target.id}>{target.component_name}</option>)}</select></Field><Field label={`Merge reason for ${row.component_name}`}><input name="note" required minLength={2} maxLength={1000} disabled={busy} /></Field><button className="button button-quiet" disabled={busy}>Review merge</button></form></details></>}</article>)}<Pagination page={page} count={count} setPage={setPage} />{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</Section></>;
}
