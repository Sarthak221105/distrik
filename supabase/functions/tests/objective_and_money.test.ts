import { assert, assertEquals } from "jsr:@std/assert@1";
import { parseObjective } from "../_shared/objective_parser.ts";
import { amountInWords, formatINR, formatRupees, groupIndian, numberToIndianWords } from "../_shared/money.ts";

const products = [
  { id: "p1", name: "Kachi Ghani Mustard Oil 5 L Jar", sku: "SKO-5L", category: "edible_oil" },
  { id: "p2", name: "Garam Masala 100 g", sku: "SGM-100", category: "spices" },
];

Deno.test("objective parser: city, state, count, buyer types, category", () => {
  const r = parseObjective("Find 75 FMCG distributors and super stockists in Bhopal who can carry our mustard oil", products);
  assertEquals(r.city, "Bhopal");
  assertEquals(r.state, "Madhya Pradesh");
  assertEquals(r.target_count, 75);
  assert(r.buyer_types.includes("distributor"));
  assert(r.buyer_types.includes("super_stockist"));
  assertEquals(r.category, "edible_oil");
  assert(r.product_hints.includes("Kachi Ghani Mustard Oil 5 L Jar"));
  assert(r.confidence >= 0.8);
  assertEquals(r.clarifications, []);
});

Deno.test("objective parser: aliases, Hinglish, defaults and clamping", () => {
  const a = parseObjective("Bangalore me masala ke wholesalers chahiye");
  assertEquals(a.city, "Bengaluru");
  assertEquals(a.state, "Karnataka");
  assertEquals(a.target_count, 75);
  assertEquals(a.category, "spices");
  assertEquals(a.buyer_types, ["wholesaler"]);
  assert(a.clarifications.some((c) => c.includes("75")));

  const b = parseObjective("Get 900 dealers in Nagpur");
  assertEquals(b.target_count, 500);
  assertEquals(b.state, "Maharashtra");

  const c = parseObjective("Spice distributors and wholesalers in Nagpur, around 60 accounts");
  assertEquals(c.target_count, 60);

  const d = parseObjective("distributors in Madhya Pradesh", products, ["p2"]);
  assertEquals(d.city, null);
  assertEquals(d.state, "Madhya Pradesh");
  assertEquals(d.category, "spices");
  assert(d.clarifications.some((x) => x.toLowerCase().includes("city")));
});

Deno.test("Indian digit grouping and rupee formatting", () => {
  assertEquals(groupIndian("3515400"), "35,15,400");
  assertEquals(groupIndian("999"), "999");
  assertEquals(groupIndian("1000"), "1,000");
  assertEquals(formatINR(3515400), "35,154.00");
  assertEquals(formatINR(351540000), "35,15,400.00");
  assertEquals(formatRupees(55800), "₹558");
  assertEquals(formatRupees(55850), "₹558.50");
});

Deno.test("amount in words, Indian numbering", () => {
  assertEquals(numberToIndianWords(0), "Zero");
  assertEquals(numberToIndianWords(15), "Fifteen");
  assertEquals(numberToIndianWords(558), "Five Hundred Fifty Eight");
  assertEquals(numberToIndianWords(100000), "One Lakh");
  assertEquals(numberToIndianWords(3515400), "Thirty Five Lakh Fifteen Thousand Four Hundred");
  assertEquals(numberToIndianWords(12_34_56_789), "Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine");
  assertEquals(numberToIndianWords(1_00_00_00_000), "One Hundred Crore");
  assertEquals(amountInWords(351540000), "Rupees Thirty Five Lakh Fifteen Thousand Four Hundred Only");
  assertEquals(amountInWords(3515440), "Rupees Thirty Five Thousand One Hundred Fifty Four and Forty Paise Only");
});
