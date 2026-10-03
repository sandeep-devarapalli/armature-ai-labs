import { ArrowLeft, ArrowUpRight, Globe, MapPin, Navigation, Pencil, Phone, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ecosystemTypeLabels, type EcosystemListing } from "../lib/ecosystem";
import { listingGoogleMapsUrl } from "../lib/ecosystemGuide";

export function EcosystemPlaceDetails({ listing, onBack, onEdit }: { listing: EcosystemListing; onBack: () => void; onEdit: () => void }) {
  const { data } = listing;
  const ref = useRef<HTMLElement>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => { ref.current?.focus({ preventScroll: true }); if (ref.current) ref.current.scrollTop = 0; setShareMessage(""); setShareUrl(""); }, [listing.slug]);
  async function share() {
    const url = new URL(window.location.href);
    url.searchParams.delete("contribute"); url.searchParams.delete("edit");
    try { await navigator.clipboard.writeText(url.toString()); setShareMessage("Listing link copied."); }
    catch { setShareUrl(url.toString()); setShareMessage("Copy this listing link:"); }
  }
  const phone = data.publicPhones[0];
  const mapsUrl = listingGoogleMapsUrl(data);
  return <article ref={ref} tabIndex={-1} className="atlas-detail" aria-label={`${data.name} details`}>
    <div className="atlas-detail-toolbar"><button onClick={onBack} aria-label="Close listing details"><ArrowLeft />Back to guide</button><button onClick={() => void share()}><Share2 />Share</button></div>
    <div role="status" className="atlas-share-status">{shareMessage}</div>
    {shareUrl && <input aria-label="Listing link" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} />}
    <h2>{data.name}</h2><p className="atlas-place-category">{data.subcategory || ecosystemTypeLabels[data.primaryType]}</p>
    <div className="atlas-detail-actions">
      {data.websiteUrl && <a className="button" href={data.websiteUrl} target="_blank" rel="noreferrer"><Globe />Website</a>}
      {mapsUrl && <a className="button" href={mapsUrl} target="_blank" rel="noreferrer"><Navigation />Directions</a>}
      {phone && <a className="button" href={`tel:${phone.number.replace(/[^+\d]/g, "")}`}><Phone />Call{data.publicPhones.length > 1 ? ` ${phone.label}` : ""}</a>}
    </div>
    <section><h3>About</h3><p>{data.summary}</p>{data.sectors.length > 0 && <small>{data.sectors.join(" · ")}</small>}{data.founders && <p>Founding team: {data.founders}</p>}</section>
    <section><h3>Visit</h3><p className="atlas-location"><MapPin />{data.locality || "Location not supplied"}</p>
      {!data.coordinates ? <small>No confirmed map pin. Contact the place before visiting.</small> : data.locationPrecision !== "Address-level" && <small>Approximate locality pin, not an exact entrance.</small>}
      {mapsUrl && <p><a href={mapsUrl} target="_blank" rel="noreferrer">Open in Google Maps <ArrowUpRight /></a></p>}
    </section>
    {(data.publicPhones.length > 0 || data.publicEmail) && <section><h3>Contact</h3>{data.publicPhones.map(item => <p key={`${item.label}-${item.number}`}><span className="atlas-contact-label">{item.label}</span><a href={`tel:${item.number.replace(/[^+\d]/g, "")}`}>{item.number}</a></p>)}{data.publicEmail && <p><a href={`mailto:${data.publicEmail}`}>{data.publicEmail}</a></p>}</section>}
    <section><h3>Before you visit</h3><p>{data.accessNote || "Contact the organisation to confirm current access and visiting arrangements."}</p>{[data.engageHow, data.salesChannel, data.priceLevel, data.minOrder, data.pricingModel, data.turnaround, data.tips].filter(Boolean).map((value, index) => <p key={index}>{value}</p>)}</section>
    <button className="button atlas-edit-primary" onClick={onEdit}><Pencil />Suggest an edit / Add details</button><small className="atlas-review-note">No login required. Changes appear after admin approval.</small>
    <div className="atlas-source">{data.sourceUrl && <a href={data.sourceUrl} target="_blank" rel="noreferrer">Public source<ArrowUpRight /></a>}{data.verifiedAt && <small>Source checked <time dateTime={data.verifiedAt}>{data.verifiedAt}</time></small>}{data.credit && <small>Contributed by {data.credit.link ? <a href={data.credit.link} target="_blank" rel="noreferrer">{data.credit.name}</a> : data.credit.name}</small>}</div>
  </article>;
}
