import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, FileClock, TriangleAlert } from "lucide-react";
import { CONTACT_EMAIL, POLICY_VERSION, policyLinks } from "./links";
import { Container } from "./section-heading";

export type PolicySection = { id: string; title: string; content: ReactNode };

/** Long-form typography for policy text (no typography plugin in this app). */
export const proseClass = [
  "text-[15px] leading-7 text-foreground/90 sm:text-base sm:leading-8",
  "[&_p]:mt-4 [&_p:first-child]:mt-0",
  "[&_ul]:mt-4 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-6 [&_ul_li]:pl-1 [&_ul_li::marker]:text-primary",
  "[&_ol]:mt-4 [&_ol]:grid [&_ol]:list-decimal [&_ol]:gap-2 [&_ol]:pl-6",
  "[&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-foreground",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/30 [&_a]:underline-offset-4 hover:[&_a]:decoration-primary",
  "[&_table]:mt-4 [&_table]:w-full [&_table]:text-sm [&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold [&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top",
].join(" ");

export function DraftNotice() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-soft px-3 py-1 text-sm font-semibold text-warning">
        <TriangleAlert className="size-4" aria-hidden />
        Draft — pending legal review
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium">
        <FileClock className="size-4 text-muted-foreground" aria-hidden />
        Version {POLICY_VERSION}
      </span>
    </div>
  );
}

/** Placeholder text that legal still has to fill in, visibly marked. */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-accent-soft px-1 py-0.5 font-medium text-accent [box-decoration-break:clone]">
      [{children}]
    </mark>
  );
}

export function PolicyDocument({
  title,
  path,
  summary,
  sections,
}: {
  title: string;
  /** This page's path, so "Other policies" can leave it out. */
  path: string;
  summary: ReactNode;
  sections: PolicySection[];
}) {
  return (
    <article aria-labelledby="policy-title">
      <header className="border-b border-border bg-surface">
        <Container className="grid gap-5 py-12 sm:py-16">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="rounded-sm hover:text-foreground">
                  Home
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight className="size-3.5" />
              </li>
              <li>
                <Link href="/policies" className="rounded-sm hover:text-foreground">
                  Policies
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight className="size-3.5" />
              </li>
              <li aria-current="page" className="text-foreground">
                {title}
              </li>
            </ol>
          </nav>
          <h1 id="policy-title" className="text-[38px] leading-[1.1] font-medium tracking-tight text-balance sm:text-h2">
            {title}
          </h1>
          <DraftNotice />
          <div className="max-w-3xl text-base text-pretty text-muted-foreground sm:text-lg">{summary}</div>
        </Container>
      </header>

      <Container className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-labelledby="toc-title" className="rounded-2xl bg-surface shadow-sm p-5 lg:border-0 lg:bg-transparent lg:p-0">
            <h2 id="toc-title" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              On this page
            </h2>
            <ol className="mt-3 grid gap-1 text-sm">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="flex gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                  >
                    <span className="w-5 shrink-0 text-right tabular">{i + 1}.</span>
                    <span>{s.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="max-w-3xl min-w-0">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24 border-b border-border py-8 first:pt-0 last:border-0">
              <h2 id={`${s.id}-h`} className="text-xl font-medium sm:text-h4">
                <span className="mr-2 text-muted-foreground tabular">{i + 1}.</span>
                {s.title}
              </h2>
              <div className={`mt-4 ${proseClass}`}>{s.content}</div>
            </section>
          ))}

          <div className="mt-10 grid gap-4 rounded-2xl bg-surface shadow-sm p-6">
            <p className="text-sm text-muted-foreground">
              Questions about this policy? Write to{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary underline-offset-4 hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
            <nav aria-label="Other policies" className="flex flex-wrap gap-2">
              {policyLinks
                .filter((l) => l.href !== path)
                .map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="rounded-full border border-border px-3 py-1 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {l.label}
                  </Link>
                ))}
            </nav>
          </div>
        </div>
      </Container>
    </article>
  );
}
