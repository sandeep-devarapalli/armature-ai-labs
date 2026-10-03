import type { EcosystemListing } from "./ecosystem";

const genericWords = new Set(["the", "and", "ai", "robotics", "robot", "technology", "technologies", "labs", "lab", "hardware", "solutions", "systems", "private", "limited", "pvt", "ltd", "inc", "company", "bengaluru", "bangalore", "india", "cafe", "community", "coworking"]);
const profileHosts = new Set(["linkedin.com", "instagram.com", "facebook.com", "x.com", "twitter.com", "github.com", "youtube.com", "youtu.be", "lu.ma", "luma.com", "linktr.ee", "sites.google.com", "notion.site"]);

export function normalizeEcosystemName(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function normalizeEcosystemWebsite(value: string): string {
  if (!value.trim()) return "";
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    const profile = [...profileHosts].some(value => host === value || host.endsWith(`.${value}`));
    return profile ? (path ? `${host}${path}` : "") : host;
  } catch { return ""; }
}

export function indexEcosystemListings(listings: readonly EcosystemListing[]) {
  return listings.map(listing => {
    const name = normalizeEcosystemName(listing.data.name);
    return { listing, name, specific: name.split(" ").some(word => word.length >= 3 && !genericWords.has(word)), website: normalizeEcosystemWebsite(listing.data.websiteUrl ?? "") };
  });
}

function oneTypoApart(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let a = 0; let b = 0; let differences = 0;
  while (a < left.length && b < right.length) {
    if (left[a] === right[b]) { a++; b++; continue; }
    if (++differences > 1) return false;
    if (left.length >= right.length) a++;
    if (right.length >= left.length) b++;
  }
  return differences + Number(a < left.length || b < right.length) <= 1;
}

export function findEcosystemMatches(index: ReturnType<typeof indexEcosystemListings>, query: { name: string; websiteUrl?: string }, excludeSlug?: string) {
  const name = normalizeEcosystemName(query.name);
  const website = normalizeEcosystemWebsite(query.websiteUrl ?? "");
  const specific = name.split(" ").some(word => word.length >= 3 && !genericWords.has(word));
  if (!website && (name.length < 4 || !specific)) return [];
  const matches: { listing: EcosystemListing; reason: string; score: number }[] = [];
  for (const entry of index) {
    if (entry.listing.slug === excludeSlug) continue;
    let score = 0;
    if (website && entry.website === website) score = 100;
    else if (specific && name.length >= 4 && entry.name === name) score = 90;
    else if (specific && entry.specific && name.length >= 5 && entry.name.length >= 5 && (entry.name.startsWith(`${name} `) || name.startsWith(`${entry.name} `))) score = 75;
    else if (specific && entry.specific && name.length >= 6 && entry.name.length >= 6 && oneTypoApart(name, entry.name)) score = 60;
    if (score) matches.push({ listing: entry.listing, reason: score === 100 ? "Same website or profile" : score === 90 ? "Same name" : "Similar name", score });
  }
  return matches.sort((a, b) => b.score - a.score || a.listing.data.name.localeCompare(b.listing.data.name) || a.listing.slug.localeCompare(b.listing.slug)).slice(0, 5);
}
