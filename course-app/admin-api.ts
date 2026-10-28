import type { SupabaseClient } from '@supabase/supabase-js';
import type { Block } from './types';
import type { LessonSummary } from './member-api';

export interface AdminCourse {
  versionId: string; courseId: string; slug: string; version: number; clonedFromVersionId?: string | null;
  title: string; description: string; status: 'draft' | 'published' | 'withdrawn';
  accessTier: 'unassigned' | 'free' | 'paid';
  finalAssessmentRoute: 'unassigned' | 'online_quiz' | 'lab_written_and_practical';
  labPolicyStatus: 'unassigned' | 'none' | 'configured';
  revision: number; reviewedRevision: number | null; reviewedAt: string | null;
  moduleCount: number; lessonCount: number;
}
export interface AdminLab {
  id?: string; moduleId: string | null; title: string; brief: string;
  completionCriteria: string; mandatory: boolean; location: string | null;
}
export interface AdminDetail {
  course: AdminCourse;
  modules: { id: string; title: string; lessons: LessonSummary[] }[];
  labRequirements: AdminLab[];
  audit: { id: string; action: string; actorId: string; createdAt: string; note: string; revision: number }[];
}
export function courseAdminApi(client: SupabaseClient) {
  async function rpc<T>(name: string, args = {}, signal?: AbortSignal): Promise<T> {
    let request = client.rpc(name, args);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    return data as T;
  }
  const args = (course: AdminCourse, note: string) => ({ p_version_id: course.versionId, p_expected_revision: course.revision, p_note: note });
  return {
    access: (signal?: AbortSignal) => rpc<{ allowed: boolean }>('get_course_admin_access', {}, signal),
    list: (signal?: AbortSignal) => rpc<AdminCourse[]>('admin_list_course_versions', {}, signal),
    detail: (id: string, signal?: AbortSignal) => rpc<AdminDetail>('admin_get_course_version', { p_version_id: id }, signal),
    lesson: (id: string, signal?: AbortSignal) => rpc<Block[]>('admin_get_course_lesson', { p_lesson_id: id }, signal),
    saveCourse: (course: AdminCourse, note: string, signal?: AbortSignal) => rpc<void>('admin_update_course_version', { ...args(course, note), p_title: course.title, p_description: course.description, p_access_tier: course.accessTier, p_final_assessment_route: course.finalAssessmentRoute, p_lab_policy_status: course.labPolicyStatus }, signal),
    saveLesson: (course: AdminCourse, lesson: LessonSummary, blocks: Block[], note: string, signal?: AbortSignal) => rpc<void>('admin_update_course_lesson', { p_lesson_id: lesson.id, p_expected_revision: course.revision, p_title: lesson.title, p_is_sample: lesson.isSample, p_blocks: blocks, p_note: note }, signal),
    saveLabs: (course: AdminCourse, labs: AdminLab[], note: string, signal?: AbortSignal) => rpc<void>('admin_replace_course_labs', { ...args(course, note), p_requirements: labs.map(({ id: _id, ...lab }) => lab) }, signal),
    review: (course: AdminCourse, note: string, signal?: AbortSignal) => rpc<void>('admin_review_course_version', args(course, note), signal),
    publish: (course: AdminCourse, note: string, signal?: AbortSignal) => rpc<void>('admin_publish_course_version', args(course, note), signal),
    withdraw: (course: AdminCourse, note: string, signal?: AbortSignal) => rpc<void>('admin_withdraw_course_version', args(course, note), signal),
    clone: (course: AdminCourse, note: string, signal?: AbortSignal) => rpc<string>('admin_clone_course_version', args(course, note), signal),
  };
}
