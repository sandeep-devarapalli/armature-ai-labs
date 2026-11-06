import { handleDeskCheckout } from "../_shared/desk-checkout.ts";

if (import.meta.main) Deno.serve(request => handleDeskCheckout(request, "live"));
