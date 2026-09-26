import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { addDays, addMinutes } from "date-fns";
import {
  INVENTORY_STORAGE_KEY,
  initialInventoryState,
  readInventoryState
} from "../data/inventoryDemo";
import {
  MAKER_SERVICES_STORAGE_KEY,
  consumableItems,
  lockerOfferings,
  makerServicesDemoState,
  readMakerServicesDemoState,
  toolkitTemplates
} from "../data/makerServices";
import { supabase } from "../lib/supabase";
import type {
  AssetUnit,
  CabinetAccessIntent,
  CabinetEvent,
  CheckoutSession,
  ComponentRequest,
  ComponentRequestStatus,
  InventoryClass,
  InventoryState,
  PublicComponentRequestInput
} from "../types/inventory";
import type {
  ConsumableOrder,
  ConsumableOrderLine,
  LockerPlanTerm,
  MakerServicesDemoState,
  ServiceAvailability,
  ToolkitRental,
  ToolkitRentalPlan
} from "../types/makerServices";
import { useApp } from "./AppContext";

interface MakerCatalogAvailability {
  lockers: Record<string, ServiceAvailability>;
  consumables: Record<string, ServiceAvailability>;
  toolkits: Record<string, ServiceAvailability>;
}

interface InventoryContextValue {
  inventory: InventoryState;
  makerServices: MakerServicesDemoState;
  makerAvailability: MakerCatalogAvailability;
  loading: boolean;
  submitPublicRequest: (input: PublicComponentRequestInput) => Promise<void>;
  verifyPublicRequest: (requestId: string, token: string) => Promise<void>;
  voteForRequest: (requestId: string) => Promise<void>;
  setRequestStatus: (
    requestId: string,
    status: ComponentRequestStatus
  ) => Promise<void>;
  adjustStock: (lotId: string, delta: number, reason: string) => Promise<void>;
  createCheckout: (notes: string) => Promise<CheckoutSession>;
  scanCheckoutItem: (sessionId: string, assetTag: string) => Promise<void>;
  completeCheckout: (sessionId: string) => Promise<void>;
  returnAsset: (
    sessionId: string,
    assetTag: string,
    condition: "good" | "attention" | "damaged"
  ) => Promise<void>;
  createCabinetAccessIntent: (
    cabinetId: string
  ) => Promise<CabinetAccessIntent>;
  simulateCabinetEvent: (
    cabinetId: string,
    kind: CabinetEvent["kind"],
    value: string,
    flagged?: boolean
  ) => Promise<void>;
  requestLocker: (
    lockerSlug: string,
    planTerm: LockerPlanTerm
  ) => Promise<void>;
  extendLocker: (
    assignmentId: string,
    planTerm: LockerPlanTerm
  ) => Promise<void>;
  assignLocker: (
    assignmentId: string,
    lockerUnitId: string
  ) => Promise<void>;
  releaseLocker: (assignmentId: string) => Promise<void>;
  submitConsumableOrder: (
    lines: ConsumableOrderLine[]
  ) => Promise<ConsumableOrder>;
  setConsumableOrderStatus: (
    orderId: string,
    status: ConsumableOrder["state"]
  ) => Promise<void>;
  rentToolkit: (
    toolkitSlug: string,
    period: ToolkitRentalPlan["period"]
  ) => Promise<ToolkitRental>;
  returnToolkit: (
    rentalId: string,
    condition: NonNullable<ToolkitRental["returnCondition"]>
  ) => Promise<void>;
  resetInventoryDemo: () => void;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

const emptyInventoryState: InventoryState = {
  requests: [],
  locations: [],
  lots: [],
  assets: [],
  checkoutSessions: [],
  cabinets: [],
  cabinetEvents: []
};

const emptyMakerServicesState: MakerServicesDemoState = {
  lockerUnits: [],
  lockerAssignments: [],
  consumableOrders: [],
  toolkitRentals: []
};

const initialMakerAvailability: MakerCatalogAvailability = {
  lockers: Object.fromEntries(
    lockerOfferings.map((offering) => [offering.slug, offering.availability])
  ),
  consumables: Object.fromEntries(
    consumableItems.map((item) => [item.slug, item.availability])
  ),
  toolkits: Object.fromEntries(
    toolkitTemplates.map((toolkit) => [toolkit.slug, toolkit.availability])
  )
};

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function lockerPlanDays(plan: LockerPlanTerm) {
  if (plan === "week") return 7;
  if (plan === "month") return 30;
  return 365;
}

function toolkitPeriodMinutes(period: ToolkitRentalPlan["period"]) {
  if (period === "session") return 4 * 60;
  if (period === "day") return 12 * 60;
  return 7 * 24 * 60;
}

function requireOnline(online: boolean) {
  if (!online) {
    throw new Error("Inventory actions require a live connection.");
  }
}

function inventoryClassFromDatabase(value: string): InventoryClass {
  if (value === "fixed_bookable") return "fixed_equipment";
  if (value === "serialized_reusable") return "serialized_asset";
  if (value === "reusable_tray") return "reusable_tray";
  return "consumable";
}

function serviceAvailabilityFromDatabase(value: string): ServiceAvailability {
  if (value === "available") return "available";
  if (value === "low_stock") return "limited";
  return "unavailable";
}

async function callInventoryRpc<T>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const rpc = supabase.rpc as unknown as (
    functionName: string,
    parameters: Record<string, unknown>
  ) => Promise<{ data: T; error: { message: string } | null }>;
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export function InventoryProvider({ children, hydrate = false }: PropsWithChildren<{ hydrate?: boolean }>) {
  const { currentMember, isStaff, mode, online, refresh, state } = useApp();
  const inventoryRef = useRef<InventoryState | null>(null);
  const [inventory, setInventory] = useState<InventoryState>(() => {
    const value = mode === "demo" && !hydrate ? readInventoryState() : emptyInventoryState;
    inventoryRef.current = value;
    return value;
  });
  const [makerServices, setMakerServices] = useState<MakerServicesDemoState>(
    () =>
      mode === "demo" && !hydrate
        ? readMakerServicesDemoState()
        : emptyMakerServicesState
  );
  const [makerAvailability, setMakerAvailability] =
    useState<MakerCatalogAvailability>(initialMakerAvailability);
  const [loading, setLoading] = useState(false);
  const [restored, setRestored] = useState(!hydrate);

  useEffect(() => {
    if (!hydrate) return;
    if (mode === "demo") {
      const value = readInventoryState();
      inventoryRef.current = value;
      setInventory(value);
      setMakerServices(readMakerServicesDemoState());
    }
    setRestored(true);
  }, [hydrate, mode]);
  const updateInventory = useCallback(
    (updater: (current: InventoryState) => InventoryState) => {
      const next = updater(inventoryRef.current ?? initialInventoryState);
      inventoryRef.current = next;
      setInventory(next);
    },
    []
  );

  const hydrateInventory = useCallback(async () => {
    if (!supabase || !currentMember) {
      if (mode === "supabase") updateInventory(() => emptyInventoryState);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const client = supabase;
      const [
        requestsResult,
        votesResult,
        stockResult,
        checkoutResult,
        checkoutAssetsResult,
        cabinetResult,
        staffLocationsResult,
        staffLotsResult,
        staffAssetsResult,
        staffEventsResult
      ] = await Promise.all([
        client.from("public_component_requests").select("*").order("created_at", { ascending: false }),
        client.from("component_request_votes").select("request_id").eq("member_id", currentMember.id),
        client.from("member_component_inventory").select("*").order("name"),
        client.from("checkout_sessions").select("*").order("opened_at", { ascending: false }),
        client.from("member_checkout_assets").select("*").order("occurred_at", { ascending: false }),
        client.from("member_active_cabinets").select("*").order("name"),
        isStaff
          ? client.from("inventory_locations").select("*").order("code")
          : Promise.resolve({ data: [], error: null }),
        isStaff
          ? client.from("inventory_lots").select("*,components(slug,inventory_kind,unit,reorder_threshold)").order("created_at")
          : Promise.resolve({ data: [], error: null }),
        isStaff
          ? client.from("asset_units").select("*,components(slug)").order("asset_tag")
          : Promise.resolve({ data: [], error: null }),
        isStaff
          ? client.from("cabinet_events").select("*").order("occurred_at", { ascending: false }).limit(100)
          : Promise.resolve({ data: [], error: null })
      ]);

      const firstError = [
        requestsResult.error,
        votesResult.error,
        stockResult.error,
        checkoutResult.error,
        checkoutAssetsResult.error,
        cabinetResult.error,
        staffLocationsResult.error,
        staffLotsResult.error,
        staffAssetsResult.error,
        staffEventsResult.error
      ].find(Boolean);
      if (firstError) throw new Error(firstError.message);

      const voterIdsByRequest = new Set(
        (votesResult.data ?? []).map((vote: { request_id: string }) => vote.request_id)
      );
      const requests: ComponentRequest[] = (requestsResult.data ?? []).map((request: any) => ({
        id: request.id,
        componentName: request.component_name,
        vendorUrl: request.vendor_url ?? "",
        projectUseCase: request.project_use_case,
        quantity: request.requested_quantity,
        urgency: (
          request.urgency === "soon"
            ? "soon"
            : request.urgency === "project_blocking" || request.urgency === "safety"
              ? "blocking"
              : "routine"
        ) as ComponentRequest["urgency"],
        budgetBand: {
          under_2500: "Under Rs 2,500",
          "2500_to_10000": "Rs 2,500 - Rs 10,000",
          "10000_to_50000": "Rs 10,000 - Rs 50,000",
          over_50000: "Above Rs 50,000",
          unknown: "Unknown"
        }[request.budget_band as string] ?? "Unknown",
        notes: request.notes ?? "",
        status: request.status as ComponentRequestStatus,
        verifiedAt: request.verified_at,
        createdAt: request.created_at,
        voteCount: request.vote_count,
        voterIds: voterIdsByRequest.has(request.id) ? [currentMember.id] : []
      }));

      const memberLocations = new Map<string, InventoryState["locations"][number]>();
      for (const row of stockResult.data ?? []) {
        if (
          !row.inventory_location_id ||
          !row.location_code ||
          !row.location_name
        ) {
          continue;
        }
        memberLocations.set(row.inventory_location_id, {
          id: row.inventory_location_id,
          code: row.location_code,
          name: row.location_name,
          description: ""
        });
      }
      const locations = isStaff
        ? (staffLocationsResult.data ?? []).map((location: any) => ({
            id: location.id,
            code: location.code,
            name: location.name,
            description: location.description ?? ""
          }))
        : Array.from(memberLocations.values());

      const lots = isStaff
        ? (staffLotsResult.data ?? []).map((lot: any) => ({
            id: lot.id,
            componentSlug: lot.components?.slug ?? "",
            locationId: lot.inventory_location_id,
            inventoryClass: inventoryClassFromDatabase(
              lot.components?.inventory_kind ?? ""
            ),
            quantityOnHand: Number(lot.quantity_on_hand),
            quantityAvailable: Number(lot.quantity_on_hand),
            reorderLevel: Number(lot.components?.reorder_threshold ?? 0),
            unit: lot.components?.unit ?? "units",
            updatedAt: lot.updated_at
          }))
        : (stockResult.data ?? []).map((row: any) => ({
            id: `${row.component_id}-${row.inventory_location_id}`,
            componentSlug: row.slug,
            locationId: row.inventory_location_id,
            inventoryClass: inventoryClassFromDatabase(row.inventory_kind),
            quantityOnHand: Number(row.available_quantity),
            quantityAvailable: Number(row.available_quantity),
            reorderLevel: 0,
            unit: row.unit,
            updatedAt: new Date().toISOString()
          }));

      const checkoutRows = checkoutAssetsResult.data ?? [];
      const checkoutSessions: CheckoutSession[] = (checkoutResult.data ?? []).map((session: any) => ({
        id: session.id,
        memberId: session.member_id,
        state: (
          session.status === "open"
            ? "draft"
            : session.status === "checked_out"
              ? "open"
              : session.status === "review"
                ? "overridden"
                : "completed"
        ) as CheckoutSession["state"],
        startedAt: session.opened_at,
        dueAt: addMinutes(new Date(session.opened_at), 240).toISOString(),
        closedAt: session.returned_at ?? undefined,
        items: checkoutRows
          .filter((row: any) => row.checkout_session_id === session.id)
          .map((row: any) => ({
            assetUnitId: row.asset_unit_id,
            assetTag: row.asset_tag,
            componentSlug: row.component_slug,
            checkedOutAt: row.occurred_at,
            returnedAt: row.closed_at ?? undefined,
            returnCondition: (row.closed_at
              ? row.condition_note?.includes("damaged")
                ? "damaged"
                : row.condition_note?.includes("attention")
                  ? "attention"
                  : "good"
              : undefined) as CheckoutSession["items"][number]["returnCondition"]
          })),
        notes: session.review_reason ?? ""
      }));

      const assets: AssetUnit[] = isStaff
        ? (staffAssetsResult.data ?? []).map((asset: any) => ({
            id: asset.id,
            componentSlug: asset.components?.slug ?? "",
            locationId: asset.inventory_location_id,
            assetTag: asset.asset_tag,
            state: (
              asset.status === "lost"
                ? "retired"
                : asset.status
            ) as AssetUnit["state"],
            condition: (asset.condition_note?.includes("damaged")
              ? "damaged"
              : asset.condition_note
                ? "attention"
                : "good") as AssetUnit["condition"],
            checkedOutTo: undefined
          }))
        : checkoutRows.map((row: any) => ({
            id: row.asset_unit_id,
            componentSlug: row.component_slug,
            locationId: row.inventory_location_id,
            assetTag: row.asset_tag,
            state: (
              row.asset_status === "lost"
                ? "retired"
                : row.asset_status
            ) as AssetUnit["state"],
            condition: (row.condition_note?.includes("damaged")
              ? "damaged"
              : row.condition_note
                ? "attention"
                : "good") as AssetUnit["condition"],
            checkedOutTo: row.member_id
          }));

      const cabinets = (cabinetResult.data ?? []).map((cabinet: any) => ({
        id: cabinet.id,
        name: cabinet.name,
        locationId: cabinet.location_id,
        state: "ready" as const,
        lastReconciledAt: cabinet.last_seen_at ?? new Date(0).toISOString()
      }));
      const cabinetEvents: CabinetEvent[] = (staffEventsResult.data ?? []).map((event: any) => ({
        id: event.id,
        cabinetId: event.cabinet_device_id,
        kind: (
          event.event_kind.startsWith("door_")
            ? "door"
            : event.event_kind === "rfid_observed"
              ? "rfid"
              : event.event_kind === "weight_observed"
                ? "weight"
                : event.event_kind === "evidence_captured"
                  ? "camera"
                  : "reconciliation"
        ) as CabinetEvent["kind"],
        value: JSON.stringify(event.payload),
        createdAt: event.occurred_at,
        flagged: event.event_kind === "reconciliation_required"
      }));

      updateInventory(() => ({
        requests,
        locations,
        lots,
        assets,
        checkoutSessions,
        cabinets,
        cabinetEvents
      }));
    } catch (error) {
      console.error("Could not load component inventory.", error);
    } finally {
      setLoading(false);
    }
  }, [currentMember, isStaff, mode, updateInventory]);

  const hydrateMakerServices = useCallback(async () => {
    if (!supabase || !currentMember) {
      if (mode === "supabase") setMakerServices(emptyMakerServicesState);
      return;
    }

    const client = supabase;
    try {
      const [
        assignmentsResult,
        ordersResult,
        rentalsResult,
        lockersResult
      ] = await Promise.all([
        client
          .from("locker_assignments")
          .select("*,locker_plans(offering_slug,period),lockers(id,code,size_label,active,maintenance_note)")
          .order("created_at", { ascending: false }),
        client
          .from("consumable_orders")
          .select("*,consumable_order_items(quantity,consumable_skus(sku_code,name,order_unit,metadata))")
          .order("created_at", { ascending: false }),
        client
          .from("toolkit_rental_sessions")
          .select("*,toolkit_kits(kit_tag,toolkit_templates(slug))")
          .order("opened_at", { ascending: false }),
        isStaff
          ? client.from("lockers").select("*").order("code")
          : Promise.resolve({ data: [], error: null })
      ]);

      const firstError = [
        assignmentsResult.error,
        ordersResult.error,
        rentalsResult.error,
        lockersResult.error
      ].find(Boolean);
      if (firstError) throw new Error(firstError.message);

      const lockerAssignments = (assignmentsResult.data ?? []).map((row: any) => ({
        id: row.id,
        memberId: row.member_id,
        lockerSlug: row.locker_plans?.offering_slug ?? "maker-locker",
        lockerLabel: row.lockers?.code ?? "Pending staff assignment",
        planTerm: (row.locker_plans?.period ?? "month") as LockerPlanTerm,
        startsOn: row.starts_at,
        endsOn: row.ends_at,
        state: (
          row.status === "requested"
            ? "reserved"
            : row.status === "reserved" || row.status === "active"
              ? "active"
              : "ended"
        ) as MakerServicesDemoState["lockerAssignments"][number]["state"],
        autoRenew: false
      }));

      const assignedLockerIds = new Set(
        (assignmentsResult.data ?? [])
          .filter((row: any) => ["reserved", "active"].includes(row.status))
          .map((row: any) => row.locker_id)
      );
      const lockerUnits = (lockersResult.data ?? []).map((row: any) => ({
        id: row.id,
        code: row.code,
        size: (
          String(row.size_label).toLowerCase().includes("small")
            ? "small"
            : String(row.size_label).toLowerCase().includes("tall")
              ? "tall"
              : "medium"
        ) as MakerServicesDemoState["lockerUnits"][number]["size"],
        state: (
          !row.active || row.maintenance_note
            ? "maintenance"
            : assignedLockerIds.has(row.id)
              ? "assigned"
              : "available"
        ) as MakerServicesDemoState["lockerUnits"][number]["state"]
      }));

      const consumableOrders = (ordersResult.data ?? []).map((row: any) => ({
        id: row.id,
        memberId: row.member_id,
        lines: (row.consumable_order_items ?? []).map((line: any) => {
          const sku = line.consumable_skus;
          const catalogItem = consumableItems.find(
            (item) => item.skuCode === sku?.sku_code
          );
          return {
            consumableSlug: catalogItem?.slug ?? sku?.sku_code ?? "unknown",
            quantity: Number(line.quantity),
            unit: sku?.order_unit ?? "unit"
          };
        }),
        total: "Rs [rate]" as const,
        state: (
          row.status === "ready"
            ? "ready"
            : row.status === "fulfilled"
              ? "collected"
              : row.status === "declined" || row.status === "cancelled"
                ? "cancelled"
                : row.status === "draft"
                  ? "draft"
                  : "submitted"
        ) as ConsumableOrder["state"],
        requestedAt: row.submitted_at ?? row.created_at,
        collectionPoint: "Tool desk"
      }));

      const toolkitRentals = (rentalsResult.data ?? []).map((row: any) => ({
        id: row.id,
        memberId: row.member_id,
        toolkitSlug: row.toolkit_kits?.toolkit_templates?.slug ?? "toolkit",
        assetTag: row.toolkit_kits?.kit_tag ?? "Assigned at tool desk",
        period: "session" as const,
        startsAt: row.opened_at,
        dueAt: addMinutes(new Date(row.opened_at), 240).toISOString(),
        state: (
          row.status === "open"
            ? "reserved"
            : row.status === "checked_out"
              ? "checked_out"
              : row.status === "review"
                ? "overdue"
                : "returned"
        ) as ToolkitRental["state"],
        deposit: "Rs [rate]" as const,
        checkoutCondition: row.checkout_condition_note
          ? "attention" as const
          : "good" as const,
        returnCondition: row.return_condition_note
          ? "attention" as const
          : row.returned_at
            ? "good" as const
            : undefined,
        returnedAt: row.returned_at ?? undefined
      }));

      setMakerServices({
        lockerUnits,
        lockerAssignments,
        consumableOrders,
        toolkitRentals
      });
    } catch (error) {
      console.error("Could not load maker desk state.", error);
    }
  }, [currentMember, isStaff, mode]);

  const hydrateMakerCatalog = useCallback(async () => {
    if (!supabase) {
      setMakerAvailability(initialMakerAvailability);
      return;
    }

    try {
      const [lockerResult, consumableResult, toolkitResult] = await Promise.all([
        supabase.from("public_locker_catalog").select("offering_slug,availability_status"),
        supabase.from("public_consumable_catalog").select("sku_code,availability_status"),
        supabase.from("public_toolkit_catalog").select("slug,availability_status")
      ]);
      const firstError = [
        lockerResult.error,
        consumableResult.error,
        toolkitResult.error
      ].find(Boolean);
      if (firstError) throw new Error(firstError.message);

      const lockerRows = lockerResult.data ?? [];
      const lockers: Record<string, ServiceAvailability> = Object.fromEntries(
        lockerOfferings.map((offering) => {
          const values = lockerRows
            .filter((row) => row.offering_slug === offering.slug)
            .map((row) =>
              serviceAvailabilityFromDatabase(row.availability_status ?? "")
            );
          const availability: ServiceAvailability = values.includes("available")
            ? "available"
            : values.includes("limited")
              ? "limited"
              : "unavailable";
          return [offering.slug, availability];
        })
      );
      const consumableSlugBySku = new Map(
        consumableItems.map((item) => [item.skuCode, item.slug])
      );
      const consumables: Record<string, ServiceAvailability> = Object.fromEntries(
        (consumableResult.data ?? []).flatMap(
          (row): [string, ServiceAvailability][] => {
          if (!row.sku_code) return [];
          const slug = consumableSlugBySku.get(row.sku_code);
          return slug
            ? [[
                slug,
                serviceAvailabilityFromDatabase(row.availability_status ?? "")
              ]]
            : [];
          }
        )
      );
      const toolkits: Record<string, ServiceAvailability> = Object.fromEntries(
        (toolkitResult.data ?? []).flatMap(
          (row): [string, ServiceAvailability][] =>
            row.slug
              ? [[
                  row.slug,
                  serviceAvailabilityFromDatabase(row.availability_status ?? "")
                ]]
              : []
        )
      );

      setMakerAvailability({ lockers, consumables, toolkits });
    } catch (error) {
      console.error("Could not load maker desk availability.", error);
    }
  }, []);

  useEffect(() => {
    if (mode === "demo" && restored) {
      window.localStorage.setItem(
        INVENTORY_STORAGE_KEY,
        JSON.stringify(inventory)
      );
    }
  }, [inventory, mode, restored]);

  useEffect(() => {
    if (mode === "demo" && restored) {
      window.localStorage.setItem(
        MAKER_SERVICES_STORAGE_KEY,
        JSON.stringify(makerServices)
      );
    }
  }, [makerServices, mode, restored]);

  useEffect(() => {
    void hydrateInventory();
  }, [hydrateInventory]);

  useEffect(() => {
    void hydrateMakerServices();
  }, [hydrateMakerServices]);

  useEffect(() => {
    void hydrateMakerCatalog();
  }, [hydrateMakerCatalog]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refresh(),
      hydrateInventory(),
      hydrateMakerServices(),
      hydrateMakerCatalog()
    ]);
  }, [hydrateInventory, hydrateMakerCatalog, hydrateMakerServices, refresh]);

  const submitPublicRequest = useCallback(
    async (input: PublicComponentRequestInput) => {
      requireOnline(online);
      if (supabase) {
        const { error } = await supabase.functions.invoke("component-request", {
          body: { action: "submit", ...input }
        });
        if (error) throw error;
        return;
      }
      updateInventory((value) => ({
        ...value,
        requests: [
          {
            id: id("request"),
            componentName: input.componentName,
            vendorUrl: input.vendorUrl,
            projectUseCase: input.projectUseCase,
            quantity: input.quantity,
            urgency: input.urgency,
            budgetBand: input.budgetBand,
            notes: input.notes,
            requesterEmail: input.email,
            status: "submitted",
            verifiedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            voteCount: 0,
            voterIds: []
          },
          ...value.requests
        ]
      }));
    },
    [online, updateInventory]
  );

  const verifyPublicRequest = useCallback(
    async (requestId: string, token: string) => {
      requireOnline(online);
      if (!supabase) return;
      const { error } = await supabase.functions.invoke("component-request", {
        body: { action: "verify", requestId, token }
      });
      if (error) throw error;
      if (currentMember) await hydrateInventory();
    },
    [currentMember, hydrateInventory, online]
  );

  const voteForRequest = useCallback(
    async (requestId: string) => {
      requireOnline(online);
      if (!currentMember) throw new Error("Sign in to vote.");
      if (supabase) {
        await callInventoryRpc("vote_component_request", {
          p_request_id: requestId
        });
        await refreshAll();
        return;
      }
      updateInventory((value) => ({
        ...value,
        requests: value.requests.map((request) => {
          if (request.id !== requestId) return request;
          if (request.voterIds.includes(currentMember.id)) {
            throw new Error("You have already voted for this request.");
          }
          return {
            ...request,
            voteCount: request.voteCount + 1,
            voterIds: [...request.voterIds, currentMember.id]
          };
        })
      }));
    },
    [currentMember, online, refreshAll, updateInventory]
  );

  const setRequestStatus = useCallback(
    async (requestId: string, status: ComponentRequestStatus) => {
      requireOnline(online);
      if (supabase) {
        await callInventoryRpc(
          "set_component_request_status",
          { p_request_id: requestId, p_status: status }
        );
        await refreshAll();
        return;
      }
      updateInventory((value) => ({
        ...value,
        requests: value.requests.map((request) =>
          request.id === requestId ? { ...request, status } : request
        )
      }));
    },
    [online, refreshAll, updateInventory]
  );

  const adjustStock = useCallback(
    async (lotId: string, delta: number, reason: string) => {
      requireOnline(online);
      if (!reason.trim()) throw new Error("A stock adjustment reason is required.");
      if (supabase) {
        await callInventoryRpc("adjust_inventory_stock", {
          p_inventory_lot_id: lotId,
          p_quantity_delta: delta,
          p_reason: reason
        });
        await refreshAll();
        return;
      }
      updateInventory((value) => ({
        ...value,
        lots: value.lots.map((lot) => {
          if (lot.id !== lotId) return lot;
          const quantityOnHand = lot.quantityOnHand + delta;
          if (quantityOnHand < 0) {
            throw new Error("Stock cannot be adjusted below zero.");
          }
          return {
            ...lot,
            quantityOnHand,
            quantityAvailable: Math.max(0, lot.quantityAvailable + delta),
            updatedAt: new Date().toISOString()
          };
        })
      }));
    },
    [online, refreshAll, updateInventory]
  );

  const createCheckout = useCallback(
    async (notes: string) => {
      requireOnline(online);
      if (!currentMember) throw new Error("Sign in to start a checkout.");
      if (supabase) {
        const attendance = state.attendance.find(
          (session) =>
            session.memberId === currentMember.id && session.state === "open"
        );
        if (!attendance) {
          throw new Error("Check in on site before borrowing lab inventory.");
        }
        const data = await callInventoryRpc<string>("begin_inventory_checkout", {
          p_attendance_session_id: attendance.id,
          p_idempotency_key: crypto.randomUUID()
        });
        await refreshAll();
        const session: CheckoutSession = {
          id: String(data),
          memberId: currentMember.id,
          state: "draft",
          startedAt: new Date().toISOString(),
          dueAt: addMinutes(new Date(), 240).toISOString(),
          items: [],
          notes
        };
        return session;
      }
      const session: CheckoutSession = {
        id: id("checkout"),
        memberId: currentMember.id,
        state: "draft",
        startedAt: new Date().toISOString(),
        dueAt: addMinutes(new Date(), 240).toISOString(),
        items: [],
        notes
      };
      updateInventory((value) => ({
        ...value,
        checkoutSessions: [session, ...value.checkoutSessions]
      }));
      return session;
    },
    [currentMember, online, refreshAll, state.attendance, updateInventory]
  );

  const scanCheckoutItem = useCallback(
    async (sessionId: string, assetTag: string) => {
      requireOnline(online);
      const normalized = assetTag.trim().toUpperCase();
      if (!normalized) throw new Error("Scan or enter an asset tag.");
      if (supabase) {
        await callInventoryRpc("scan_checkout_asset", {
          p_checkout_session_id: sessionId,
          p_asset_tag: normalized
        });
        await refreshAll();
        return;
      }
      updateInventory((value) => {
        const asset = value.assets.find((item) => item.assetTag === normalized);
        if (!asset) throw new Error("Asset tag not found.");
        if (asset.state !== "available") {
          throw new Error("This asset is not available.");
        }
        const session = value.checkoutSessions.find(
          (item) => item.id === sessionId
        );
        if (!session || session.state !== "draft") {
          throw new Error("Start an open checkout before scanning.");
        }
        if (session.items.some((item) => item.assetUnitId === asset.id)) {
          throw new Error("This asset is already in the checkout.");
        }
        return {
          ...value,
          checkoutSessions: value.checkoutSessions.map((item) =>
            item.id === sessionId
              ? {
                  ...item,
                  items: [
                    ...item.items,
                    {
                      assetUnitId: asset.id,
                      assetTag: asset.assetTag,
                      componentSlug: asset.componentSlug,
                      checkedOutAt: new Date().toISOString()
                    }
                  ]
                }
              : item
          )
        };
      });
    },
    [online, refreshAll, updateInventory]
  );

  const completeCheckout = useCallback(
    async (sessionId: string) => {
      requireOnline(online);
      if (supabase) {
        await callInventoryRpc("complete_inventory_checkout", {
          p_checkout_session_id: sessionId
        });
        await refreshAll();
        return;
      }
      updateInventory((value) => {
        const session = value.checkoutSessions.find(
          (item) => item.id === sessionId
        );
        if (!session?.items.length) {
          throw new Error("Scan at least one asset before completing checkout.");
        }
        const assetIds = new Set(session.items.map((item) => item.assetUnitId));
        return {
          ...value,
          checkoutSessions: value.checkoutSessions.map((item) =>
            item.id === sessionId ? { ...item, state: "open" } : item
          ),
          assets: value.assets.map((asset) =>
            assetIds.has(asset.id)
              ? {
                  ...asset,
                  state: "checked_out",
                  checkedOutTo: session.memberId
                }
              : asset
          )
        };
      });
    },
    [online, refreshAll, updateInventory]
  );

  const returnAsset = useCallback(
    async (
      sessionId: string,
      assetTag: string,
      condition: "good" | "attention" | "damaged"
    ) => {
      requireOnline(online);
      const normalized = assetTag.trim().toUpperCase();
      if (supabase) {
        await callInventoryRpc("return_inventory_asset", {
          p_checkout_session_id: sessionId,
          p_asset_tag: normalized,
          p_condition_note: condition
        });
        await refreshAll();
        return;
      }
      updateInventory((value) => {
        const session = value.checkoutSessions.find(
          (item) => item.id === sessionId
        );
        const checkoutItem = session?.items.find(
          (item) => item.assetTag === normalized && !item.returnedAt
        );
        if (!session || !checkoutItem) {
          throw new Error("This asset is not open in the selected checkout.");
        }
        const returnedAt = new Date().toISOString();
        const items = session.items.map((item) =>
          item.assetTag === normalized
            ? { ...item, returnedAt, returnCondition: condition }
            : item
        );
        const allReturned = items.every((item) => item.returnedAt);
        return {
          ...value,
          checkoutSessions: value.checkoutSessions.map((item) =>
            item.id === sessionId
              ? {
                  ...item,
                  items,
                  state: allReturned ? "completed" : item.state,
                  closedAt: allReturned ? returnedAt : item.closedAt
                }
              : item
          ),
          assets: value.assets.map((asset) =>
            asset.id === checkoutItem.assetUnitId
              ? {
                  ...asset,
                  state: condition === "good" ? "available" : "maintenance",
                  condition,
                  checkedOutTo: undefined
                }
              : asset
          )
        };
      });
    },
    [online, refreshAll, updateInventory]
  );

  const createCabinetAccessIntent = useCallback(
    async (cabinetId: string) => {
      requireOnline(online);
      if (!currentMember) throw new Error("Sign in to open a cabinet.");
      if (supabase) {
        const data = await callInventoryRpc<{
          token?: string;
          expires_at?: string;
        }>(
          "create_cabinet_access_intent",
          { p_cabinet_device_id: cabinetId }
        );
        const result = data;
        if (!result.token || !result.expires_at) {
          throw new Error("The cabinet access response was incomplete.");
        }
        return {
          token: result.token,
          expiresAt: result.expires_at,
          cabinetId,
          memberId: currentMember.id
        };
      }
      return {
        token: crypto.randomUUID(),
        expiresAt: addMinutes(new Date(), 1).toISOString(),
        cabinetId,
        memberId: currentMember.id
      };
    },
    [currentMember, online]
  );

  const simulateCabinetEvent = useCallback(
    async (
      cabinetId: string,
      kind: CabinetEvent["kind"],
      value: string,
      flagged = false
    ) => {
      requireOnline(online);
      if (supabase) {
        throw new Error(
          "Hardware cabinet events must arrive through the signed device endpoint."
        );
      }
      const event: CabinetEvent = {
        id: id("cabinet-event"),
        cabinetId,
        kind,
        value,
        createdAt: new Date().toISOString(),
        flagged
      };
      updateInventory((state) => ({
        ...state,
        cabinetEvents: [event, ...state.cabinetEvents].slice(0, 100),
        cabinets: state.cabinets.map((cabinet) =>
          cabinet.id === cabinetId
            ? {
                ...cabinet,
                state: flagged
                  ? "attention"
                  : kind === "door" && value === "open"
                    ? "open"
                    : kind === "reconciliation"
                      ? "ready"
                      : "reconciling",
                lastReconciledAt:
                  kind === "reconciliation"
                    ? event.createdAt
                    : cabinet.lastReconciledAt
              }
            : cabinet
        )
      }));
    },
    [online, updateInventory]
  );

  const requestLocker = useCallback(
    async (lockerSlug: string, planTerm: LockerPlanTerm) => {
      requireOnline(online);
      if (!currentMember) throw new Error("Sign in to request a locker.");
      if (
        makerServices.lockerAssignments.some(
          (assignment) =>
            assignment.memberId === currentMember.id &&
            ["reserved", "active", "expiring"].includes(assignment.state)
        )
      ) {
        throw new Error("You already have a current locker request or assignment.");
      }
      if (supabase) {
        await callInventoryRpc("request_locker_subscription", {
          p_locker_offering_slug: lockerSlug,
          p_plan_term: planTerm
        });
        await refreshAll();
        return;
      }
      const startsOn = new Date();
      setMakerServices((value) => ({
        ...value,
        lockerAssignments: [
          {
            id: id("locker-assignment"),
            memberId: currentMember.id,
            lockerSlug,
            lockerLabel: "Pending staff assignment",
            planTerm,
            startsOn: startsOn.toISOString(),
            endsOn: addDays(startsOn, lockerPlanDays(planTerm)).toISOString(),
            state: "reserved",
            autoRenew: false
          },
          ...value.lockerAssignments
        ]
      }));
    },
    [currentMember, makerServices.lockerAssignments, online, refreshAll]
  );

  const extendLocker = useCallback(
    async (assignmentId: string, planTerm: LockerPlanTerm) => {
      requireOnline(online);
      if (supabase) {
        await callInventoryRpc("extend_locker_subscription", {
          p_assignment_id: assignmentId,
          p_plan_term: planTerm
        });
        await refreshAll();
        return;
      }
      setMakerServices((value) => ({
        ...value,
        lockerAssignments: value.lockerAssignments.map((assignment) => {
          if (assignment.id !== assignmentId) return assignment;
          const currentEnd = new Date(assignment.endsOn);
          const base = currentEnd > new Date() ? currentEnd : new Date();
          return {
            ...assignment,
            planTerm,
            endsOn: addDays(base, lockerPlanDays(planTerm)).toISOString(),
            state: "active"
          };
        })
      }));
    },
    [online, refreshAll]
  );

  const assignLocker = useCallback(
    async (assignmentId: string, lockerUnitId: string) => {
      requireOnline(online);
      if (!lockerUnitId) throw new Error("Select an available physical locker.");
      if (supabase) {
        await callInventoryRpc("assign_locker_subscription", {
          p_assignment_id: assignmentId,
          p_locker_unit_id: lockerUnitId
        });
        await refreshAll();
        return;
      }
      setMakerServices((value) => ({
        ...value,
        lockerUnits: value.lockerUnits.map((unit) =>
          unit.id === lockerUnitId ? { ...unit, state: "assigned" } : unit
        ),
        lockerAssignments: value.lockerAssignments.map((assignment) =>
          assignment.id === assignmentId
            ? {
                ...assignment,
                lockerLabel:
                  value.lockerUnits.find((unit) => unit.id === lockerUnitId)?.code ??
                  "Assigned locker",
                state: "active"
              }
            : assignment
        )
      }));
    },
    [online, refreshAll]
  );

  const releaseLocker = useCallback(
    async (assignmentId: string) => {
      requireOnline(online);
      if (supabase) {
        await callInventoryRpc("release_locker_subscription", {
          p_assignment_id: assignmentId
        });
        await refreshAll();
        return;
      }
      setMakerServices((value) => ({
        ...value,
        lockerUnits: value.lockerUnits.map((unit) =>
          value.lockerAssignments.some(
            (assignment) =>
              assignment.id === assignmentId &&
              assignment.lockerLabel === unit.code
          )
            ? { ...unit, state: "available" }
            : unit
        ),
        lockerAssignments: value.lockerAssignments.map((assignment) =>
          assignment.id === assignmentId
            ? {
                ...assignment,
                state: "ended",
                endsOn: new Date().toISOString()
              }
            : assignment
        )
      }));
    },
    [online, refreshAll]
  );

  const submitConsumableOrder = useCallback(
    async (lines: ConsumableOrderLine[]) => {
      requireOnline(online);
      if (!currentMember) throw new Error("Sign in to reserve bench stock.");
      const validLines = lines.filter((line) => line.quantity > 0);
      if (!validLines.length) {
        throw new Error("Add at least one consumable to the pickup order.");
      }
      if (supabase) {
        const result = await callInventoryRpc<string>("create_consumable_order", {
          p_lines: validLines.map((line) => ({
            sku_code:
              consumableItems.find((item) => item.slug === line.consumableSlug)
                ?.skuCode ?? line.consumableSlug,
            quantity: line.quantity
          }))
        });
        await refreshAll();
        const order: ConsumableOrder = {
          id: String(result),
          memberId: currentMember.id,
          lines: validLines,
          total: "Rs [rate]",
          state: "submitted",
          requestedAt: new Date().toISOString(),
          collectionPoint: "Tool desk"
        };
        return order;
      }
      const order: ConsumableOrder = {
        id: id("consumable-order"),
        memberId: currentMember.id,
        lines: validLines,
        total: "Rs [rate]",
        state: "submitted",
        requestedAt: new Date().toISOString(),
        collectionPoint: "Tool desk"
      };
      setMakerServices((value) => ({
        ...value,
        consumableOrders: [order, ...value.consumableOrders]
      }));
      return order;
    },
    [currentMember, online, refreshAll]
  );

  const setConsumableOrderStatus = useCallback(
    async (orderId: string, status: ConsumableOrder["state"]) => {
      requireOnline(online);
      if (supabase) {
        await callInventoryRpc("set_consumable_order_status", {
          p_order_id: orderId,
          p_status: status
        });
        await refreshAll();
        return;
      }
      setMakerServices((value) => ({
        ...value,
        consumableOrders: value.consumableOrders.map((order) =>
          order.id === orderId ? { ...order, state: status } : order
        )
      }));
    },
    [online, refreshAll]
  );

  const rentToolkit = useCallback(
    async (
      toolkitSlug: string,
      period: ToolkitRentalPlan["period"]
    ) => {
      requireOnline(online);
      if (!currentMember) throw new Error("Sign in to rent a toolkit.");
      const existing = makerServices.toolkitRentals.find(
        (rental) =>
          rental.memberId === currentMember.id &&
          rental.toolkitSlug === toolkitSlug &&
          ["reserved", "checked_out", "overdue"].includes(rental.state)
      );
      if (existing) throw new Error("You already have this toolkit open.");
      if (supabase) {
        const result = await callInventoryRpc<string>("start_toolkit_rental", {
          p_toolkit_template_slug: toolkitSlug,
          p_period:
            period === "session"
              ? "4 hours"
              : period === "day"
                ? "12 hours"
                : "7 days"
        });
        await refreshAll();
        const rental: ToolkitRental = {
          id: String(result),
          memberId: currentMember.id,
          toolkitSlug,
          assetTag: "Assigned at tool desk",
          period,
          startsAt: new Date().toISOString(),
          dueAt: addMinutes(
            new Date(),
            toolkitPeriodMinutes(period)
          ).toISOString(),
          state: "reserved",
          deposit: "Rs [rate]",
          checkoutCondition: "good"
        };
        return rental;
      }
      const rental: ToolkitRental = {
        id: id("toolkit-rental"),
        memberId: currentMember.id,
        toolkitSlug,
        assetTag: `ARM-KIT-DEMO-${String(
          makerServices.toolkitRentals.length + 1
        ).padStart(3, "0")}`,
        period,
        startsAt: new Date().toISOString(),
        dueAt: addMinutes(
          new Date(),
          toolkitPeriodMinutes(period)
        ).toISOString(),
        state: "checked_out",
        deposit: "Rs [rate]",
        checkoutCondition: "good"
      };
      setMakerServices((value) => ({
        ...value,
        toolkitRentals: [rental, ...value.toolkitRentals]
      }));
      return rental;
    },
    [
      currentMember,
      makerServices.toolkitRentals,
      online,
      refreshAll
    ]
  );

  const returnToolkit = useCallback(
    async (
      rentalId: string,
      condition: NonNullable<ToolkitRental["returnCondition"]>
    ) => {
      requireOnline(online);
      if (supabase) {
        await callInventoryRpc("return_toolkit_rental", {
          p_rental_id: rentalId,
          p_condition_note: condition
        });
        await refreshAll();
        return;
      }
      setMakerServices((value) => ({
        ...value,
        toolkitRentals: value.toolkitRentals.map((rental) =>
          rental.id === rentalId
            ? {
                ...rental,
                state: "returned",
                returnCondition: condition,
                returnedAt: new Date().toISOString()
              }
            : rental
        )
      }));
    },
    [online, refreshAll]
  );

  const resetInventoryDemo = useCallback(() => {
    if (mode !== "demo") return;
    inventoryRef.current = initialInventoryState;
    setInventory(initialInventoryState);
    setMakerServices(makerServicesDemoState);
    setMakerAvailability(initialMakerAvailability);
  }, [mode]);

  const value = useMemo<InventoryContextValue>(
    () => ({
      inventory,
      makerServices,
      makerAvailability,
      loading,
      submitPublicRequest,
      verifyPublicRequest,
      voteForRequest,
      setRequestStatus,
      adjustStock,
      createCheckout,
      scanCheckoutItem,
      completeCheckout,
      returnAsset,
      createCabinetAccessIntent,
      simulateCabinetEvent,
      requestLocker,
      extendLocker,
      assignLocker,
      releaseLocker,
      submitConsumableOrder,
      setConsumableOrderStatus,
      rentToolkit,
      returnToolkit,
      resetInventoryDemo
    }),
    [
      inventory,
      makerServices,
      makerAvailability,
      loading,
      submitPublicRequest,
      verifyPublicRequest,
      voteForRequest,
      setRequestStatus,
      adjustStock,
      createCheckout,
      scanCheckoutItem,
      completeCheckout,
      returnAsset,
      createCabinetAccessIntent,
      simulateCabinetEvent,
      requestLocker,
      extendLocker,
      assignLocker,
      releaseLocker,
      submitConsumableOrder,
      setConsumableOrderStatus,
      rentToolkit,
      returnToolkit,
      resetInventoryDemo
    ]
  );

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error("useInventory must be used inside InventoryProvider");
  }
  return context;
}
