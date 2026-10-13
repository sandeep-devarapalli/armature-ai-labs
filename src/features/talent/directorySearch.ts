export interface DirectoryPerson {
  id: string;
  name: string;
  headline: string;
  title: string;
  company: string;
  previousCompanies: string[];
  location: string;
  yearsExperience: number | null;
  skills: string[];
  physicalAiAreas: string[];
  summary: string;
  checkedAt: string;
  linkedinUrl: string;
  claimed: boolean;
  revision?: number;
  availability?: string;
}

export interface DirectoryQuery {
  query: string;
  location: string;
  category: string;
  company: string;
  sort: 'relevance' | 'name';
}

type Field = { label: string; value: string; normalized: string; tokens: Set<string>; weight: number; employer: boolean };
export type DirectoryIndex = ReturnType<typeof buildDirectoryIndex>;
const aliases: Record<string, string> = {
  bangalore: 'bengaluru', firmware: 'embedded', drones: 'drone', uav: 'drone', uavs: 'drone',
  engineers: 'engineer', robots: 'robot', robotics: 'robot', systems: 'system',
};
const stopwords = new Set('i want to find looking for who have has worked working work with in on at and the a an people someone experience experienced'.split(' '));
const technicalTerms = new Set('embedded drone robot perception slam control controls mechanical electrical electronics hardware software ai ml learning vision lidar camera navigation autonomy autonomous simulation manipulation actuator pcb cad ros ros2 vla vlm tinyml edge'.split(' '));
function normalize(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ros\s+2\b/g, 'ros2');
}
function tokens(value: string) {
  return (normalize(value).match(/[\p{L}\p{N}+#]+/gu) ?? []).map(token => aliases[token] ?? token);
}
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function buildDirectoryIndex(people: DirectoryPerson[]) {
  return people.map(person => {
    const fields: Field[] = [];
    const add = (label: string, value: string, weight: number, employer = false) => {
      if (value) fields.push({ label, value, normalized: normalize(value).trim(), tokens: new Set(tokens(value)), weight, employer });
    };
    add('Name', person.name, 10);
    add('Title', person.title, 8);
    add('Headline', person.headline, 5);
    add('Location', person.location, 2);
    person.skills.forEach(value => add('Research-derived skill category', value, 3));
    person.physicalAiAreas.forEach(value => add('Research-derived physical-AI category', value, 3));
    add('Company', person.company, 4, true);
    person.previousCompanies.forEach(value => add('Previous company', value, 2, true));
    return { person, fields, location: normalize(person.location), locationTokens: new Set(tokens(person.location)), categories: new Set([...person.skills, ...person.physicalAiAreas].map(normalize)), company: normalize(person.company) };
  });
}

export function searchDirectory(index: DirectoryIndex, query: DirectoryQuery): { person: DirectoryPerson; matches: string[] }[] {
  let terms = [...new Set(tokens(query.query).filter(term => !stopwords.has(term)))];
  if (terms.length > 1) terms = terms.filter(term => term !== 'engineer');
  const normalizedQuery = normalize(query.query).trim();
  const capabilitySearch = terms.some(term => technicalTerms.has(term));
  const location = normalize(query.location);
  const bengaluru = location === 'bengaluru' || location === 'bangalore';
  const category = normalize(query.category);
  const company = normalize(query.company);
  const results: { person: DirectoryPerson; matches: string[]; score: number }[] = [];
  for (const record of index) {
    if (location && !(bengaluru ? record.locationTokens.has('bengaluru') : record.location === location)) continue;
    if (category && !record.categories.has(category)) continue;
    if (company && record.company !== company) continue;
    const exactIdentityLookup = capabilitySearch && record.fields.some(field => (field.employer || field.label === 'Name') && field.normalized === normalizedQuery);
    const matches = new Set<string>();
    let score = 0;
    let accepted = true;
    for (const term of terms) {
      const fields = record.fields.filter(field => field.tokens.has(term) && !(capabilitySearch && !exactIdentityLookup && technicalTerms.has(term) && (field.employer || field.label === 'Name')));
      if (!fields.length) { accepted = false; break; }
      score += Math.max(...fields.map(field => field.weight));
      fields.forEach(field => matches.add(`${field.label}: ${field.value}`));
    }
    if (!accepted) continue;
    if (category) matches.add(`Research-derived category: ${query.category}`);
    if (location) matches.add(`Location: ${record.person.location}`);
    if (company) matches.add(`Company: ${record.person.company}`);
    results.push({ person: record.person, matches: [...matches], score });
  }
  results.sort((a, b) => (query.sort === 'relevance' ? b.score - a.score : 0) || collator.compare(a.person.name, b.person.name) || collator.compare(a.person.id, b.person.id));
  return results.map(({ person, matches }) => ({ person, matches }));
}
