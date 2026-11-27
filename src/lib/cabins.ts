// First-floor rates are monthly list prices for negotiable whole-cabin quotes.
export type CabinStatus = "available" | "occupied" | "coming_soon" | "quote";
export type Cabin = {
  code: "C01" | "C02" | "C04";
  name: string;
  room: string;
  floor: "ground" | "first";
  billable: number;
  monthlyRentPaise: number;
  extra: number;
  status: CabinStatus;
  photos: { src: string; alt: string }[];
  photoCaption?: string;
  depositPaise?: number | null;
};

const photos101 = [
  { src: "/media/cabins/cabin-101-1.jpg", alt: "Cabin 101: wooden double door with barred windows, a wall of brown wardrobes and a pine desk with black mesh chairs" },
  { src: "/media/cabins/cabin-101-2.jpg", alt: "Cabin 101: the double door and side windows, carpet tiles and chairs" }
];
const illustration = (name: string, file: string, seats: number) => ({
  photos: [{ src: `/media/cabins/${file}`, alt: `${name}: illustration of the fitted-out room with pine desks and black mesh chairs for ${seats}` }],
  photoCaption: `${name}, illustration based on Cabin 101`
});

export const cabins: Cabin[] = [
  { code: "C01", name: "Cabin 101", room: "GF-01", floor: "ground", billable: 4, monthlyRentPaise: 8_000_000, extra: 2, status: "occupied", photos: photos101 },
  { code: "C04", name: "Cabin 201", room: "FF-06", floor: "first", billable: 10, monthlyRentPaise: 12_000_000, extra: 2, status: "quote", ...illustration("Cabin 201", "cabin-201.jpg", 12) },
  { code: "C02", name: "Cabin 202", room: "FF-03", floor: "first", billable: 6, monthlyRentPaise: 8_000_000, extra: 2, status: "quote", ...illustration("Cabin 202", "cabin-202.jpg", 8) },
];

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const formatPaise = (paise: number) => rupees.format(paise / 100);
export const statusLabel: Record<CabinStatus, string> = { available: "Available", occupied: "Occupied", coming_soon: "Coming soon", quote: "Quote" };
