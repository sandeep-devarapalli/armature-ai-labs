import { handleRentalCheckout } from "../_shared/rental-checkout.ts";
Deno.serve(request => handleRentalCheckout(request, "live"));
