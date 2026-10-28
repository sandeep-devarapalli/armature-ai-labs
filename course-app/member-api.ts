import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Block } from './types';

export interface CourseMembership {
  verified: boolean; basic?: boolean; membership_levels_enabled?: boolean;
  membership_level?: 'basic' | 'verified' | 'premium' | null;
  role?: 'member' | 'membership_reviewer' | 'admin' | 'super_admin';
  next_status_change_at?: string | null;
}
export function courseLevelsEnabled(membership: CourseMembership | null | undefined) {
  return import.meta.env.VITE_MEMBERSHIP_LEVELS_ENABLED === 'true' && membership?.membership_levels_enabled === true;
}

export type CatalogueCourse = Pick<MemberCourse, 'id' | 'versionId' | 'title' | 'description' | 'moduleCount' | 'lessonCount' | 'accessTier' | 'requiresVerifiedMembership' | 'coverUrl'>;

export interface MemberCourse {
  id: string; versionId: string; title: string; description: string;
  moduleCount: number; lessonCount: number; accessTier: 'free' | 'paid'; requiresVerifiedMembership?: boolean;
  finalAssessmentRoute: 'unassigned' | 'online_quiz' | 'lab_written_and_practical';
  labPolicyStatus: 'unassigned' | 'none' | 'configured';
  canLearn: boolean; enrolled: boolean; readCount: number;
  resumeLessonId: string | null; lastBlock: number;
  coverUrl?: string | null;
}
export interface LessonSummary { id: string; title: string; isSample: boolean }
export interface Syllabus {
  modules: { id: string; title: string; lessons: LessonSummary[] }[];
  labRequirements: { id: string; moduleId: string | null; title: string; brief: string; completionCriteria: string; mandatory: boolean; location: string | null }[];
}
export interface Progress { lessonId: string; lastBlock: number; readAt: string | null; updatedAt: string }
export interface FinalQuizStatus {
  available: boolean; eligible?: boolean; questionCount?: number; passPercent?: number; timeLimitMinutes?: number; retakeHours?: number;
  attempts?: number; bestPercent?: number | null; passed?: boolean; passedAt?: string | null;
  openAttempt?: { id: string; expiresAt: string } | null; nextAttemptAt?: string | null;
}
export interface FinalQuizQuestion { id: string; question: string; options: { id: string; text: string }[] }
export interface FinalQuizAttempt { attemptId: string; startedAt: string; expiresAt: string; passPercent: number; questions: FinalQuizQuestion[] }
export interface FinalQuizResult {
  attemptId: string; outcome: 'graded' | 'expired'; correct: number; total: number; percent: number; passed: boolean;
  passPercent: number; submittedAt: string; nextAttemptAt: string | null;
}

export type LabFieldType = 'number' | 'text' | 'choice' | 'yesno' | 'table';
export interface LabColumn { key: string; label: string; type: 'number' | 'text'; unit?: string }
export interface LabField { key: string; label: string; type: LabFieldType; unit?: string; required?: boolean; options?: string[]; columns?: LabColumn[]; minRows?: number }
export type LabValue = number | string | boolean | Record<string, number | string | null>[] | null;
export type LabValues = Record<string, LabValue>;
export type LabStatus = 'draft' | 'submitted' | 'returned' | 'approved';
export interface LabSubmission {
  id: string; status: LabStatus; values: LabValues; notes: string; photos: string[]; shareConsent: boolean; revision: number;
  submittedAt: string | null; reviewedAt: string | null; reviewComment: string | null; updatedAt: string;
}
export interface LabCheckpoint { requirementId: string; moduleId: string; title: string; mandatory: boolean; fields: LabField[]; submission: LabSubmission | null }
export interface LabAssessment {
  labsRequired: number; labsApproved: number; writtenTotal: number | null; writtenPassPercent: number | null;
  writtenScore: number | null; writtenPassed: boolean | null; writtenAt: string | null; practicalPassed: boolean | null; practicalAt: string | null; passedAt: string | null;
}
export interface MyCourseLabs { available: boolean; enrolled?: boolean; labs?: LabCheckpoint[]; assessment?: LabAssessment }
export interface LabQueueItem {
  id: string; status: LabStatus; revision: number; submittedAt: string | null; reviewedAt: string | null;
  learner: { id: string; name: string | null; email: string | null }; course: { slug: string; title: string; versionId: string }; module: string; lab: string | null;
}
export interface LabSubmissionDetail {
  submission: LabSubmission; userId: string; versionId: string; moduleId: string;
  learner: { name: string | null; email: string | null }; course: { slug: string; title: string }; module: string;
  requirement: { title: string; brief: string; completionCriteria: string } | null; fields: LabField[];
  events: { action: 'save' | 'submit' | 'approve' | 'return'; comment: string | null; at: string; byLearner: boolean }[];
  overall: { labs: LabCheckpoint[]; assessment: LabAssessment }; canReview: boolean;
}
export const LAB_EVIDENCE_BUCKET = 'course-lab-evidence';

export function createCourseClient() {
  const url = import.meta.env.VITE_COURSES_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_COURSES_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'armature-courses-auth' } });
}

export function courseApi(client: SupabaseClient) {
  async function rpc<T>(name: string, args = {}, signal?: AbortSignal): Promise<T> {
    let request = client.rpc(name, args);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    return data as T;
  }
  return {
    publicCatalog: (signal?: AbortSignal) => rpc<CatalogueCourse[]>('get_public_course_catalog', {}, signal),
    catalog: (signal?: AbortSignal) => rpc<MemberCourse[]>('get_my_course_catalog', {}, signal),
    membership: (signal?: AbortSignal) => rpc<CourseMembership>('get_course_membership', {}, signal),
    syllabus: (version: string, signal?: AbortSignal) => rpc<Syllabus>('get_course_syllabus', { p_version_id: version }, signal),
    progress: (version: string, signal?: AbortSignal) => rpc<Progress[]>('get_my_course_progress', { p_version_id: version }, signal),
    lesson: (lesson: string, signal?: AbortSignal) => rpc<Block[]>('get_course_lesson', { p_lesson_id: lesson }, signal),
    enroll: (version: string, signal?: AbortSignal) => rpc('enroll_in_course', { p_version_id: version }, signal),
    quizStatus: (version: string, signal?: AbortSignal) => rpc<FinalQuizStatus>('get_my_course_final_quiz', { p_version_id: version }, signal),
    startQuiz: (version: string, signal?: AbortSignal) => rpc<FinalQuizAttempt>('start_course_final_quiz', { p_version_id: version }, signal),
    submitQuiz: (attempt: string, answers: Record<string, string>, signal?: AbortSignal) => rpc<FinalQuizResult>('submit_course_final_quiz', { p_attempt_id: attempt, p_answers: answers }, signal),
    labs: (version: string, signal?: AbortSignal) => rpc<MyCourseLabs>('get_my_course_labs', { p_version_id: version }, signal),
    saveLab: (version: string, module: string, values: LabValues, notes: string, photos: string[], consent: boolean, submit: boolean, revision: number | null) =>
      rpc<LabSubmission>('save_my_course_lab', { p_version_id: version, p_module_id: module, p_values: values, p_notes: notes, p_photos: photos, p_consent: consent, p_submit: submit, p_expected_revision: revision }),
    reviewerStatus: (signal?: AbortSignal) => rpc<{ reviewer: boolean; viewer: boolean }>('get_course_lab_reviewer_status', {}, signal),
    labQueue: (status: LabStatus, signal?: AbortSignal) => rpc<LabQueueItem[]>('get_course_lab_queue', { p_status: status }, signal),
    labSubmission: (id: string, signal?: AbortSignal) => rpc<LabSubmissionDetail>('get_course_lab_submission', { p_submission_id: id }, signal),
    reviewLab: (id: string, revision: number, decision: 'approve' | 'return', comment: string) =>
      rpc<LabSubmissionDetail>('review_course_lab', { p_submission_id: id, p_expected_revision: revision, p_decision: decision, p_comment: comment || null }),
    recordAssessment: (user: string, version: string, writtenScore: number | null, practicalPassed: boolean | null, practicalNotes: string | null) =>
      rpc<{ labs: LabCheckpoint[]; assessment: LabAssessment }>('record_course_assessment', { p_user_id: user, p_version_id: version, p_written_score: writtenScore, p_practical_passed: practicalPassed, p_practical_notes: practicalNotes }),
    uploadLabPhoto: async (path: string, file: File) => {
      const { error } = await client.storage.from(LAB_EVIDENCE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      return path;
    },
    labPhotoUrl: async (path: string) => {
      const { data, error } = await client.storage.from(LAB_EVIDENCE_BUCKET).createSignedUrl(path, 600);
      if (error) throw error;
      return data.signedUrl;
    },
    save: (lesson: string, block: number, read: boolean, signal?: AbortSignal) => rpc<{ lesson_id: string; last_block: number; read_at: string | null; updated_at: string }>('save_course_lesson_progress', { p_lesson_id: lesson, p_last_block: block, p_read: read }, signal),
  };
}
export type CourseApi = ReturnType<typeof courseApi>;
