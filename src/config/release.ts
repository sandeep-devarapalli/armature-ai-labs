import { demoModeEnabled, isBackendAvailable, isSupabaseConfigured } from "../lib/supabase";

const enabled = (value: string | undefined) => value === "true";

export const equipmentPageAvailable = false;

export const memberPlatformEnabled = enabled(
  import.meta.env.VITE_MEMBER_PLATFORM_ENABLED
);

export const componentRequestsEnabled = enabled(
  import.meta.env.VITE_COMPONENT_REQUESTS_ENABLED
);

export const memberPlatformAvailable =
  isBackendAvailable && (demoModeEnabled || memberPlatformEnabled);

export const componentRequestsAvailable =
  isBackendAvailable && (demoModeEnabled || componentRequestsEnabled);

export const basicOnboardingAvailable = !demoModeEnabled && isSupabaseConfigured
  && enabled(import.meta.env.VITE_BASIC_ONBOARDING_ENABLED);
