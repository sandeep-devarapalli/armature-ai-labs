import { supabase } from "../lib/supabase";
import { requestOnboardingDocument } from "../lib/onboarding";
import { OnboardingForm } from "./OnboardingForm";

const requestDocument = (id: string, file?: File) => {
  if (!supabase) throw new Error("Registration is unavailable.");
  return requestOnboardingDocument(supabase, import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY, id, file);
};
export function OnboardingPage() {
  return <OnboardingForm client={supabase} requestDocument={requestDocument} />;
}
