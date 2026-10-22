import { Languages, MapPin, MessageCircle, ShieldCheck } from "lucide-react";
import { Reveal } from "./reveal";
import { CONTAINER } from "./section-heading";

// Honest product facts only: no customer counts or performance percentages.
const facts = [
  {
    icon: ShieldCheck,
    big: "₹0",
    title: "below your floor without a yes",
    body: "Prices never leave your rules. The floor is checked in the database on every quote, not left to an AI prompt.",
  },
  {
    icon: MessageCircle,
    big: "Opt-in",
    title: "consent-first WhatsApp",
    body: "No cold broadcasts to bought lists. A buyer who says STOP is opted out before the next message can go.",
  },
  {
    icon: MapPin,
    big: "Mumbai",
    title: "data stays in India",
    body: "Your products, buyers and conversations are stored in India, built with the DPDP Act 2023 in mind.",
  },
  {
    icon: Languages,
    big: "3",
    title: "languages buyers actually use",
    body: "The agent replies in the buyer’s own language: English, Hindi or Hinglish.",
  },
];

export function Benefits() {
  return (
    <section aria-labelledby="benefits-title" className={CONTAINER}>
      <div className="relative isolate overflow-hidden rounded-[28px] bg-band text-white shadow-xl">
        <div
          aria-hidden
          className="animate-drift pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_20rem_at_100%_0%,rgb(255_255_255/0.14),transparent_70%),radial-gradient(30rem_18rem_at_0%_100%,rgb(108_132_252/0.35),transparent_70%)]"
        />
        <div className="px-6 py-16 sm:px-10 sm:py-24 lg:px-16">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 id="benefits-title" className="text-[34px] leading-[1.15] font-medium tracking-tight text-balance sm:text-[40px] lg:text-h2">
              Built so you stay in control
            </h2>
            <p className="mt-4 text-base text-pretty opacity-85 sm:text-lg">
              An AI that sells for you has to follow your rules every time. These are guarantees of how the product
              works, not marketing numbers.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/12 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((f, i) => (
              <Reveal key={f.title} delay={i * 90} className="h-full">
                <div className="flex h-full flex-col gap-3 bg-band p-6">
                  <f.icon className="size-5 opacity-80" aria-hidden />
                  <p>
                    <span className="block font-display text-h3 font-medium tabular">{f.big}</span>
                    <span className="mt-1 block text-sm font-semibold">{f.title}</span>
                  </p>
                  <p className="text-sm text-pretty opacity-80">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
