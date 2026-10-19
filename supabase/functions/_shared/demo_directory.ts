// demo_directory source adapter: deterministic synthetic (but realistic)
// Indian B2B buyers for a campaign's city and category, seeded by campaign id.
// Contains no real personal data. Output follows the canonical payload shape
// documented in normalize_campaign_records.

import { type City, cityByName, CITIES } from "./india_cities.ts";

export interface CanonicalRecord {
  external_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  type: string;
  category_hint: string | null;
  website: string | null;
  source_url: string | null;
  contact_name: string;
  contact_role: string;
  brands: string[];
  signals: Record<string, number>;
  verified: boolean;
  description: string;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(arr: T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}

const PREFIXES = [
  "Shree Balaji", "Jai Ambe", "Mahalaxmi", "Om Sai", "Shri Krishna", "Shiv Shakti", "Gupta", "Agarwal", "Jain", "Patel",
  "Maheshwari", "Bansal", "Goyal", "Khandelwal", "Mittal", "Saraf", "Rathi", "Singhal", "New India", "Royal", "Star",
  "Sunrise", "Prime", "Metro", "Golden", "Ganesh", "Laxmi", "Annapurna", "Vinayak", "Bajrang", "Sai Kripa", "Hari Om",
  "Radhe", "Kamdhenu", "Navkar", "Mangalam", "Shubham", "Siddhi Vinayak", "Tirupati", "Durga",
];
const SUFFIX_BY_TYPE: Record<string, string[]> = {
  distributor: ["Distributors", "Agencies", "Marketing", "Enterprises", "Distribution Co"],
  super_stockist: ["Super Stockist", "Super Stockists", "Trade Links"],
  wholesaler: ["Traders", "Trading Co", "Wholesale", "Wholesale Mart", "Brothers"],
  dealer: ["Sales Corporation", "Dealers", "Sales Agency"],
  retailer: ["General Stores", "Super Mart", "Kirana Bhandar", "Departmental Store"],
};
const TYPE_WEIGHTS: Array<[string, number]> = [["distributor", 0.38], ["wholesaler", 0.25], ["super_stockist", 0.1], ["dealer", 0.15], ["retailer", 0.12]];
const FIRST = ["Ramesh", "Suresh", "Mahesh", "Rajesh", "Sanjay", "Vijay", "Anil", "Sunil", "Deepak", "Manoj", "Ashok", "Pradeep", "Naveen", "Vinod", "Rakesh", "Amit", "Rohit", "Imran", "Salim", "Harpreet", "Gurpreet", "Venkatesh", "Srinivas", "Murugan", "Prakash", "Kiran", "Nitin", "Sachin", "Arun", "Dinesh"];
const LAST = ["Agrawal", "Gupta", "Jain", "Sharma", "Verma", "Patel", "Shah", "Maheshwari", "Bansal", "Goyal", "Khandelwal", "Mittal", "Reddy", "Rao", "Iyer", "Nair", "Singh", "Yadav", "Chouhan", "Rathore", "Khan", "Deshmukh", "Kulkarni", "Joshi", "Soni"];
const ROLES = ["Proprietor", "Partner", "Owner", "Purchase Manager", "Director"];
const BRANDS: Record<string, string[]> = {
  edible_oil: ["Fortune", "Dhara", "Engine", "Patanjali", "Saffola", "Sundrop", "Gemini", "Emami", "Postman", "P Mark"],
  spices: ["MDH", "Everest", "Catch", "Badshah", "Tata Sampann", "Aachi", "Eastern", "Ramdev", "Suhana"],
  home_care: ["Vim", "Surf Excel", "Harpic", "Lizol", "Ghadi", "Nirma", "Wheel"],
  fmcg: ["Parle", "Britannia", "Haldiram", "Amul", "Tata Salt", "Aashirvaad", "Fortune", "MDH"],
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function weightedType(r: ReturnType<typeof prng>): string {
  const x = r.next();
  let acc = 0;
  for (const [t, w] of TYPE_WEIGHTS) {
    acc += w;
    if (x <= acc) return t;
  }
  return "distributor";
}

export function recordCount(perRun: number | undefined, targetCount: number | undefined): number {
  const per = perRun && perRun > 0 ? perRun : 60;
  const target = targetCount && targetCount > 0 ? targetCount : per;
  return Math.max(10, Math.min(200, Math.round((per + target * 1.2) / 2)));
}

export function generateDemoDirectory(opts: {
  campaignId: string;
  city: string | null;
  state: string | null;
  category: string | null;
  count: number;
}): CanonicalRecord[] {
  const r = prng(hashSeed(opts.campaignId + ":" + (opts.city ?? "")));
  const city: City = cityByName(opts.city) ?? {
    ...(CITIES.find((c) => c.state.toLowerCase() === (opts.state ?? "").toLowerCase()) ?? CITIES[13]),
    name: opts.city ?? "Bhopal",
  };
  const category = opts.category ?? "fmcg";
  const brandPool = BRANDS[category] ?? BRANDS.fmcg;
  const phoneBlock = String(hashSeed(opts.campaignId) % 900 + 100); // 3 digits per campaign
  const usedNames = new Set<string>();
  const out: CanonicalRecord[] = [];
  for (let i = 0; i < opts.count; i++) {
    const type = weightedType(r);
    const locality = r.pick(city.localities);
    let name = "";
    for (let tries = 0; tries < 6; tries++) {
      const base = r.chance(0.2) ? locality : r.pick(PREFIXES);
      name = `${base} ${r.pick(SUFFIX_BY_TYPE[type])}`;
      if (!usedNames.has(name)) break;
    }
    if (usedNames.has(name)) name = `${name} ${city.name}`;
    usedNames.add(name);
    const slug = slugify(name);
    const contact = `${r.pick(FIRST)} ${r.pick(LAST)}`;
    const nBrands = r.int(1, 3);
    const brands: string[] = [];
    while (brands.length < nBrands) {
      const b = r.pick(brandPool);
      if (!brands.includes(b)) brands.push(b);
    }
    const scale = type === "retailer" ? 0.25 : type === "super_stockist" ? 0.85 : type === "distributor" ? 0.65 : 0.5;
    const sig = (base: number) => Math.round(Math.max(0, Math.min(1, base + (r.next() - 0.5) * 0.4)) * 100) / 100;
    const signals: Record<string, number> = {
      geographic_coverage: sig(scale),
      brands_carried: sig(0.35 + brands.length * 0.15),
      retail_network: sig(scale),
      logistics: sig(scale - 0.05),
    };
    if (r.chance(0.8)) signals.company_size = sig(scale);
    const listed = r.chance(0.7);
    const outlets = Math.round((type === "retailer" ? 0 : 80 + scale * 500) * (0.7 + r.next() * 0.6));
    out.push({
      external_id: `${slugify(city.name)}-${slug}-${i + 1}`,
      name,
      phone: `+919${phoneBlock}${String(r.int(0, 999999)).padStart(6, "0")}`,
      email: r.chance(0.35) ? `${slug.split("-")[0]}.${slug.split("-").slice(-1)[0]}@example.in` : null,
      address: `${r.int(1, 240)}, ${locality}, ${city.name}`,
      city: city.name,
      state: opts.state ?? city.state,
      pincode: `${city.pin}${String(r.int(1, 99)).padStart(3, "0")}`,
      lat: Math.round((city.lat + (r.next() - 0.5) * 0.16) * 1e6) / 1e6,
      lng: Math.round((city.lng + (r.next() - 0.5) * 0.16) * 1e6) / 1e6,
      type,
      category_hint: category,
      website: r.chance(0.25) ? `https://${slug}.example.in` : null,
      source_url: listed ? `https://demo.directory.local/${slugify(city.name)}/${slug}` : null,
      contact_name: contact,
      contact_role: r.pick(ROLES),
      brands,
      signals,
      verified: listed,
      description: type === "retailer"
        ? `${name} is a retail store in ${locality}, ${city.name}, stocking ${brands.join(", ")}.`
        : `${name} is a ${type.replace("_", " ")} in ${locality}, ${city.name}, supplying ${brands.join(", ")} to around ${outlets} retail outlets.`,
    });
  }
  return out;
}
