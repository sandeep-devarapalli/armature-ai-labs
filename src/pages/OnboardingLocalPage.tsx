import type { FormEvent } from "react";
import { onboardingLocal, requestLocalDocument } from "../lib/onboardingLocal";
import { OnboardingForm } from "./OnboardingForm";

async function localLogin(event: FormEvent<HTMLFormElement>) {
  const fields = new FormData(event.currentTarget);
  const { data, error } = await onboardingLocal!.auth.signInWithPassword({ email: String(fields.get("email")), password: String(fields.get("password")) });
  if (error) throw error;
  return data.session;
}
export function OnboardingLocalPage() {
  return <OnboardingForm client={onboardingLocal} requestDocument={requestLocalDocument} localLogin={localLogin} />;
}
