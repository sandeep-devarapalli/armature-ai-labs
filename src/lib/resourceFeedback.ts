import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export const feedbackDocuments = {
  "robotic-actuators-white-paper": { title: "Robotic actuators white paper", file: "white-paper.html" },
  "actuator-specifications": { title: "Actuator specifications", file: "actuator-specifications.html" }
} as const;
export type FeedbackDocument = keyof typeof feedbackDocuments;
export type FeedbackStatus = "pending" | "approved" | "rejected" | "withdrawn";
export interface ResourceFeedback {
  id: string; document: FeedbackDocument; version: string; kind: "comment" | "correction";
  reference: string; body: string; source_url: string | null; display_name: string;
  response: string; created_at: string; updated_at: string; revision: number;
  status?: FeedbackStatus; review_note?: string;
}
export interface FeedbackList { items: ResourceFeedback[]; total: number }
export interface FeedbackAccess { can_submit: boolean; can_moderate: boolean }
export const feedbackBase = "/resources/white-paper/robotic-actuators";
export const feedbackConsent = "2026-10-25-resource-feedback-v1";
export function feedbackDocument(value: string | null): FeedbackDocument {
  return value === "actuator-specifications" ? value : "robotic-actuators-white-paper";
}
export function feedbackSource(value: string | null) {
  try { const url = new URL(value || ""); return ["http:", "https:"].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
type FeedbackRpc = "resource_feedback_access" | "list_resource_feedback" | "list_my_resource_feedback" | "submit_resource_feedback" | "withdraw_resource_feedback" | "list_resource_feedback_queue" | "review_resource_feedback";
export async function feedbackRpc<T>(name: FeedbackRpc, args: Record<string, unknown> = {}, client: SupabaseClient | null = supabase): Promise<T> {
  if (!client) throw new Error("Comments are temporarily unavailable. Please try again later.");
  const result = await client.rpc(name, args);
  if (result.error) {
    if (result.error.code === "42501") throw new Error("Your account cannot perform this action. Please sign in or refresh your membership status.");
    if (/rate|limit|too many/i.test(result.error.message)) throw new Error("You have reached the feedback limit. Please try again later.");
    if (/revision|changed|stale/i.test(result.error.message)) throw new Error("This feedback changed. Refresh the list before trying again.");
    throw new Error("The request could not be completed. Your text is still here; please try again.");
  }
  return result.data as T;
}
