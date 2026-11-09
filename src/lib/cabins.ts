// Owner 2026-11-09: rooms from the glass-run plans; list price INR 20,000 per billable seat a month, extra seats free.
// Cabin 101 is occupied under a licence. 201-203 have no deposit or start date yet.
export type CabinStatus = "available" | "occupied" | "coming_soon";
export type Cabin = {
  code: "C01" | "C02" | "C03" | "C04";
  name: string;
  room: string;
  floor: "ground" | "first";
  billable: number;
  extra: number;
  status: CabinStatus;
  photos: { src: string; alt: string }[];
};

export const seatPaise = 2000000;

const photos101 = [
  { src: "/media/cabins/cabin-101-1.jpg", alt: "Cabin 101: wooden double door with barred windows, a wall of brown wardrobes and a pine desk with black mesh chairs" },
  { src: "/media/cabins/cabin-101-2.jpg", alt: "Cabin 101: the double door and side windows, carpet tiles and chairs" }
];

export const cabins: Cabin[] = [
  { code: "C01", name: "Cabin 101", room: "GF-01", floor: "ground", billable: 4, extra: 2, status: "occupied", photos: photos101 },
  { code: "C04", name: "Cabin 201", room: "FF-06", floor: "first", billable: 10, extra: 2, status: "coming_soon", photos: [] },
  { code: "C02", name: "Cabin 202", room: "FF-03", floor: "first", billable: 6, extra: 2, status: "coming_soon", photos: [] },
  { code: "C03", name: "Cabin 203", room: "FF-04", floor: "first", billable: 6, extra: 3, status: "coming_soon", photos: [] }
];

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const formatPaise = (paise: number) => rupees.format(paise / 100);
export const cabinRent = (cabin: Cabin) => cabin.billable * seatPaise;
export const statusLabel: Record<CabinStatus, string> = { available: "Available", occupied: "Occupied", coming_soon: "Coming soon" };
