import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { DirectoryPerson } from './directorySearch';
export const talentClient = () => { if (!supabase) throw new Error('Talent network is temporarily unavailable. Please try again later.'); return supabase as SupabaseClient; };
export type TalentRow = { id: string; data: DirectoryPerson; revision: number; published: boolean };
export type TalentRequest = { id: string; profile_id: string; requester_id: string; profile_name: string; kind: string; status: string; evidence: string; review_note: string; created_at: string; base_revision: number };
export type TalentStatus = { owner: boolean; admin: boolean; requests: TalentRequest[] };
export async function talentRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await talentClient().rpc(name, args);
  if (error) throw new Error(error.code === 'P0409' ? 'This profile changed. Refresh it before saving or reviewing again.' : error.message);
  return data as T;
}
export async function loadTalent(): Promise<DirectoryPerson[]> {
  const people: DirectoryPerson[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await talentClient().from('talent_profiles').select('id,data,revision,published').eq('published', true).order('id').range(start, start + 499);
    if (error) throw new Error(error.message);
    const rows = data as TalentRow[];
    people.push(...rows.map(row => ({ ...row.data, id: row.id, revision: row.revision })));
    if (rows.length < 500) return people;
  }
}
