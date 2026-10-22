import Link from "next/link";
import { Mail, MapPin } from "lucide-react";
import { LogoMark } from "./logo";
import { CONTACT_EMAIL, policyLinks, productLinks } from "./links";

const footLink = "rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-[1800px] px-3 sm:px-5 lg:px-8 2xl:px-10 grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="grid content-start gap-4">
          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-md font-display text-xl font-medium tracking-tight">
            <LogoMark />
            Distrik
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">
            An AI sales employee for Indian manufacturers. It finds buyers, sells on WhatsApp inside your rules and brings
            back only the decisions that need a person.
          </p>
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
            <MapPin className="size-3.5 text-primary" aria-hidden />
            Data stays in India (Mumbai)
          </p>
        </div>

        <nav aria-labelledby="footer-product" className="grid content-start gap-3">
          <h2 id="footer-product" className="text-sm font-semibold">
            Product
          </h2>
          <ul className="grid gap-2">
            {productLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={footLink}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/#waitlist" className={footLink}>
                Join the waitlist
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-policies" className="grid content-start gap-3">
          <h2 id="footer-policies" className="text-sm font-semibold">
            Policies
          </h2>
          <ul className="grid gap-2">
            {policyLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={footLink}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/policies" className={footLink}>
                All policies
              </Link>
            </li>
          </ul>
        </nav>

        <div className="grid content-start gap-3">
          <h2 className="text-sm font-semibold">Contact</h2>
          <ul className="grid gap-2">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className={`${footLink} inline-flex items-center gap-2`}>
                <Mail className="size-4" aria-hidden />
                {CONTACT_EMAIL}
              </a>
            </li>
            <li>
              <Link href="/login" className={footLink}>
                Sign in
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto w-full max-w-[1800px] px-3 sm:px-5 lg:px-8 2xl:px-10 flex flex-col gap-2 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Distrik. All rights reserved.</p>
          <p>Built for B2B selling in India. Prices in INR, plus GST.</p>
        </div>
      </div>
    </footer>
  );
}
