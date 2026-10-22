import Link from "next/link";
import { ArrowRight, Ban, Lock, MessageCircle, Scale } from "lucide-react";
import { Reveal } from "./reveal";
import { Container, SectionHeading } from "./section-heading";

const items = [
  {
    icon: MessageCircle,
    title: "Consent and opt-out",
    body: "We message a buyer only after they have engaged or opted in. Replying STOP opts them out at once, and it is logged.",
    href: "/policies/privacy#consent",
    link: "How consent works",
  },
  {
    icon: Scale,
    title: "Price guardrails",
    body: "The AI quotes only prices your rules allow. Anything below your floor needs a person’s approval; below your hard minimum it is refused.",
    href: "/policies/terms#ai-agent",
    link: "AI agent terms",
  },
  {
    icon: Lock,
    title: "Data protection and DPDP",
    body: "Data is stored in India. Each contact has a recorded basis and consent evidence, and people can ask for their data to be erased.",
    href: "/policies/privacy#dpdp",
    link: "Read the DPDP notice",
  },
  {
    icon: Ban,
    title: "No cold broadcasts",
    body: "No bulk messaging to purchased number lists. Outside WhatsApp’s 24-hour window, only Meta-approved templates are used.",
    href: "/policies/terms#acceptable-use",
    link: "Acceptable use",
  },
];

export function PoliciesSummary() {
  return (
    <section id="policies" aria-labelledby="policies-title" className="scroll-mt-20 bg-surface py-20 lg:py-section">
      <Container>
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <Reveal>
            <SectionHeading
              id="policies-title"
              align="left"
              eyebrow="Our policies"
              title="Guardrails your buyers can trust"
              description="Selling on WhatsApp only works if buyers trust the messages they receive. These rules are built into the product."
            />
          </Reveal>
          <Link
            href="/policies"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            All policies <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <li key={it.title}>
              <Reveal delay={i * 90} className="h-full">
                <div className="flex h-full flex-col gap-3 rounded-2xl bg-background p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <it.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="text-lg font-medium">{it.title}</h3>
                  <p className="text-sm text-pretty text-muted-foreground">{it.body}</p>
                  <Link
                    href={it.href}
                    className="mt-auto inline-flex items-center gap-1 rounded-sm pt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {it.link} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
