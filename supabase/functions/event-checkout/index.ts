import { handleEventCheckout } from "../_shared/event-checkout.ts";
Deno.serve(request => handleEventCheckout(request, "live"));
