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

export const deskCheckoutAvailable = basicOnboardingAvailable && enabled(import.meta.env.VITE_DESK_CHECKOUT_ENABLED);

export const rentalCheckoutAvailable = basicOnboardingAvailable && enabled(import.meta.env.VITE_RENTAL_CHECKOUT_ENABLED);

export const eventCheckoutAvailable = basicOnboardingAvailable && enabled(import.meta.env.VITE_EVENT_CHECKOUT_ENABLED);

export const equipmentSaleAvailable = rentalCheckoutAvailable && enabled(import.meta.env.VITE_EQUIPMENT_SALE_ENABLED);
