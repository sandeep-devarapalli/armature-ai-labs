import { expect, it } from 'vitest';
import { normalizeTalentRow, type TalentRow } from '../../src/features/talent/liveTalent';
import { buildDirectoryIndex, searchDirectory } from '../../src/features/talent/directorySearch';
it('keeps an incomplete sourced identity searchable without inventing optional details', () => {
 const row = { id: 'test', revision: 2, published: true, data: { name: 'Synthetic Engineer', linkedinUrl: 'https://linkedin.com/in/synthetic-engineer', skills: [null, 'Embedded'], claimed: 'true' } } as unknown as TalentRow;
 const person = normalizeTalentRow(row);
 const matches = searchDirectory(buildDirectoryIndex([person]), { query: 'embedded', category: '', location: '', company: '', sort: 'relevance' });
 expect(matches.map(m => m.person.id)).toEqual(['test']);
 expect(person.previousCompanies).toEqual([]);
 expect(person.company).toBe('');
 expect(person.yearsExperience).toBeNull();
 expect(person.claimed).toBe(false);
});

it('keeps only a validated server photo version', () => {
 const row = { id: 'test', revision: 2, published: true, data: { claimed: true, photoVersion: '78000000-0000-4000-8000-000000000001' } } as TalentRow;
 expect(normalizeTalentRow(row).photoVersion).toBe(row.data.photoVersion);
 expect(normalizeTalentRow({ ...row, data: { ...row.data, photoVersion: 'https://untrusted.test/photo' } }).photoVersion).toBeUndefined();
});
