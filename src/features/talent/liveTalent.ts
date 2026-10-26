import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { DirectoryPerson } from './directorySearch';
export const talentClient = () => { if (!supabase) throw new Error('Talent network is temporarily unavailable. Please try again later.'); return supabase as SupabaseClient; };
export type TalentRow = { id: string; data: DirectoryPerson; revision: number; published: boolean };
export type TalentRequest = { id: string; profile_id: string; requester_id: string; profile_name: string; kind: string; status: string; evidence: string; review_note: string; created_at: string; base_revision: number; published?: boolean; declaration?: { signed_name: string; text: string; version: string; accepted_at: string; linkedin_url: string; profile_name: string } | null };
export type TalentStatus = { owner: boolean; admin: boolean; requests: TalentRequest[] };
export async function talentRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await talentClient().rpc(name, args);
  if (error) throw new Error(error.code === 'P0409' ? 'This profile changed. Refresh it before saving or reviewing again.' : error.message);
    if (['talent_update_profile', 'talent_admin_update_profile', 'talent_unlist_profile', 'talent_review_request', 'talent_review_submission'].includes(name) && typeof window !== 'undefined') window.dispatchEvent(new Event('talent-directory-invalidated'));
  return data as T;
}
export function normalizeTalentRow(row: TalentRow): DirectoryPerson {
  const data = row.data;
  const text = (value: unknown) => typeof value === 'string' ? value : '';
  const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  return { ...data, id: row.id, revision: row.revision,
    name: text(data.name), title: text(data.title), headline: text(data.headline), company: text(data.company),
    location: text(data.location), summary: text(data.summary), checkedAt: text(data.checkedAt), linkedinUrl: text(data.linkedinUrl),
    previousCompanies: list(data.previousCompanies), skills: list(data.skills), physicalAiAreas: list(data.physicalAiAreas),
    yearsExperience: typeof data.yearsExperience === 'number' && Number.isFinite(data.yearsExperience) ? data.yearsExperience : null,
    portfolioProjects: Array.isArray(data.portfolioProjects) ? data.portfolioProjects.filter(project => project && typeof project === 'object').map(project => ({
      title: text(project.title), summary: text(project.summary), contribution: text(project.contribution), skills: list(project.skills), evidenceUrl: text(project.evidenceUrl),
    })) : [],
    claimed: data.claimed === true,
    source: data.source === 'member' ? 'member' : undefined,
    education: text(data.education), experience: text(data.experience),
    availability: ['available', 'unavailable'].includes(text(data.availability)) ? text(data.availability) : 'unknown',
    photoVersion: typeof data.photoVersion === 'string' && /^[0-9a-f-]{36}$/i.test(data.photoVersion) ? data.photoVersion : undefined,
  };
}
export async function loadTalent(): Promise<DirectoryPerson[]> {
  const people: DirectoryPerson[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await talentClient().from('talent_profiles').select('id,data,revision,published').eq('published', true).order('id').range(start, start + 499);
    if (error) throw new Error(error.message);
    const rows = data as TalentRow[];
    people.push(...rows.map(normalizeTalentRow));
    if (rows.length < 500) return people;
  }
}
