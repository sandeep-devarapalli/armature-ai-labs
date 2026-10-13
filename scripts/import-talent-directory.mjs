import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const source = process.argv[2] || '/Users/dev/Downloads/Robotics Talent Leads/05_directory_export/robotics_talent_directory_2026-10-13.json';
const datasetPath = fileURLToPath(new URL('../src/features/talent/directory-data.json', import.meta.url));
const reportPath = fileURLToPath(new URL('../docs/talent-directory-import-report.json', import.meta.url));
const bytes = await readFile(source);
const input = JSON.parse(bytes.toString('utf8'));
if (!Array.isArray(input)) throw new Error('Expected an array of directory records');

const clean = value => typeof value === 'string' ? value.trim() : '';
const list = value => [...new Set(clean(value).split(';').map(clean).filter(Boolean))];
function canonicalLinkedin(value) {
  const url = new URL(clean(value));
  if (url.protocol !== 'https:' || !/^(www\.)?linkedin\.com$/i.test(url.hostname) || url.port || url.username || url.password) throw new Error('Invalid LinkedIn host or protocol');
  if (!/^\/in\/[^/]+\/?$/.test(url.pathname)) throw new Error('Expected a personal LinkedIn URL');
  return `https://www.linkedin.com${url.pathname.replace(/\/$/, '')}`;
}

const rows = [];
const rejectedRecords = [];
const relevance = [];
const ids = new Set();
const urls = new Set();
const normalizedUrls = [];
for (const [index, record] of input.entries()) {
  try {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid record');
    const id = clean(record.id);
    const name = clean(record.name);
    if (!id || !name) throw new Error('Missing ID or name');
    if (ids.has(id)) throw new Error('Duplicate ID');
    const linkedinUrl = canonicalLinkedin(record.linkedin_url);
    const identity = decodeURIComponent(linkedinUrl).normalize('NFC').toLowerCase();
    if (urls.has(identity)) throw new Error('Duplicate canonical LinkedIn identity');
    const yearsExperience = record.years_experience === '' || record.years_experience == null ? null : record.years_experience;
    if (yearsExperience !== null && (typeof yearsExperience !== 'number' || !Number.isFinite(yearsExperience) || yearsExperience < 0)) throw new Error('Invalid source-reported experience');
    const checkedAt = clean(record.data_as_of);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt) || new Date(`${checkedAt}T00:00:00Z`).toISOString().slice(0, 10) !== checkedAt) throw new Error('Invalid source date');
    rows.push({ id, name, headline: clean(record.headline), title: clean(record.current_title), company: clean(record.current_company), previousCompanies: list(record.previous_companies), location: clean(record.location), yearsExperience, skills: list(record.skill_areas), physicalAiAreas: list(record.physical_ai_areas), summary: clean(record.summary), checkedAt, linkedinUrl, claimed: false });
    ids.add(id);
    urls.add(identity);
    relevance.push({ id, sourceRelevance: clean(record.robotics_relevance) });
    if (linkedinUrl !== record.linkedin_url) normalizedUrls.push({ id, original: record.linkedin_url, canonical: linkedinUrl });
  } catch (error) {
    rejectedRecords.push({ sourcePosition: index + 1, id: record?.id ?? null, reason: error.message });
  }
}
const missingFields = Object.fromEntries(['headline', 'title', 'company', 'previousCompanies', 'location', 'yearsExperience', 'skills', 'physicalAiAreas', 'summary'].map(field => [field, rows.filter(row => row[field] === '' || row[field] === null || (Array.isArray(row[field]) && row[field].length === 0)).length]));
const report = {
  source, sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  sourcePreserved: true,
  publicationPermission: { confirmedBy: 'Owner', confirmedOn: '2026-10-13', basis: 'Owner states that the supplied third-party talent directory permits listing.', releaseScope: 'Local review only; public deployment remains a separate step.' },
  sourceRecords: input.length, acceptedRecords: rows.length, uniqueIds: ids.size, uniqueCanonicalLinkedinIdentities: urls.size,
  rejectedRecords, normalizedUrls, missingFields,
  allImportedUnclaimed: rows.every(row => !row.claimed),
  sourceDates: [...new Set(rows.map(row => row.checkedAt))].sort(),
  relevanceCounts: relevance.reduce((counts, row) => { counts[row.sourceRelevance || 'Not provided'] = (counts[row.sourceRelevance || 'Not provided'] || 0) + 1; return counts; }, {}),
  privateRelevanceRecords: relevance,
  limitations: ['Skill and physical-AI categories are research-derived, not individually verified.', 'Years of experience are source-reported total experience, not company tenure.', 'Education, portfolios, availability, verified skills and verification badges are not supplied.', 'checkedAt reflects the source data_as_of date, not an independent profile check.', 'No contact enrichment, public release or ownership authentication is performed by this import.'],
};
await writeFile(datasetPath, `${JSON.stringify(rows)}\n`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ acceptedRecords: rows.length, rejectedRecords: rejectedRecords.length, sourceSha256: report.sourceSha256, missingFields }, null, 2));
if (rejectedRecords.length) process.exitCode = 1;
