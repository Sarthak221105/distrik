import { ClipboardCheck, Package, Send, Target } from "lucide-react";
import { Reveal } from "./reveal";
import { Container, SectionHeading } from "./section-heading";

const steps = [
  {
    icon: Package,
    title: "Upload products and set your rules",
    body: "Add products from a catalogue or a sheet, with HSN, GST rate and MOQ. Set a floor price and a hard minimum per quantity tier, plus which decisions always need a person.",
  },
  {
    icon: Target,
    title: "Name a market",
    body: "Write what you want in plain words: “Find 75 FMCG distributors in Bhopal”. Distrik finds, cleans and scores the businesses that fit.",
  },
  {
    icon: ClipboardCheck,
    title: "Review the leads",
    body: "Your team approves, rejects, merges and assigns in Lead Review. Only approved buyers are ever contacted, and consent rules still apply.",
  },
  {
    icon: Send,
    title: "The AI sells. You approve and confirm.",
    body: "The agent talks to buyers on WhatsApp and sends GST quotations. You approve exceptions in one tap and confirm orders against matched POs.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 py-20 lg:py-section">
      <Container>
        <Reveal>
          <SectionHeading
            id="how-title"
            eyebrow="How it works"
            title="Four steps from product to orders"
            description="Set it up once. After that, your team spends its time on the decisions that matter."
          />
        </Reveal>
        <ol className="relative mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <span
            aria-hidden
            className="absolute top-7 right-[12%] left-[12%] hidden h-px bg-linear-to-r from-transparent via-primary/40 to-transparent lg:block"
          />
          {steps.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 110} className="h-full">
                <div className="relative flex h-full flex-col gap-4 rounded-2xl bg-surface shadow-sm p-6 transition-[border-color,box-shadow] duration-300 hover:shadow-lg">
                  <div className="flex items-center gap-3">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground tabular shadow-sm">
                      <span className="sr-only">Step </span>
                      {i + 1}
                    </span>
                    <s.icon className="size-5 text-primary" aria-hidden />
                  </div>
                  <h3 className="text-h4 font-medium text-balance">{s.title}</h3>
                  <p className="text-sm text-pretty text-muted-foreground">{s.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
