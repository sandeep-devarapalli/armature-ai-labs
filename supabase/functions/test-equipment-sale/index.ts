import { handleEquipmentSale } from "../_shared/equipment-sale.ts";
Deno.serve(request => handleEquipmentSale(request, "test"));
