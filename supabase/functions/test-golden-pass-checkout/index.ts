import { handleGoldenPass } from "../_shared/golden-pass-checkout.ts";
Deno.serve(request => handleGoldenPass(request, "test"));
