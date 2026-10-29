"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { CONTAINER } from "./section-heading";
import { policyLinks, productLinks } from "./links";

const navLink =
  "rounded-full px-4 py-2 text-[15px] sm:text-base font-medium text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-surface-muted";

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className={cn(CONTAINER, "sticky top-0 z-40 pt-3 sm:pt-5")}>
      <nav
        aria-label="Main"
        className={cn(
          "w-full flex h-[72px] sm:h-20 items-center gap-5 rounded-full border px-5 sm:px-8 transition-all duration-300",
          scrolled || open
            ? "border-border bg-surface/95 shadow-md backdrop-blur-md"
            : "border-border/80 bg-surface/75 shadow-xs backdrop-blur-sm",
        )}
      >
        <Logo />

        <ul className="ml-6 sm:ml-8 hidden items-center gap-1.5 lg:flex">
          {productLinks.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={navLink}>
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(navLink, "inline-flex items-center gap-1 data-[state=open]:text-foreground")}>
                Policies <ChevronDown className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56 rounded-2xl border-border bg-surface shadow-lg">
                {policyLinks.map((l) => (
                  <DropdownMenuItem key={l.href} asChild>
                    <Link href={l.href}>{l.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/policies">All policies</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>

        <div className="ml-auto hidden items-center gap-4 lg:flex">
          <Link href="/login" className="text-[15px] sm:text-base font-medium text-muted-foreground transition-colors hover:text-foreground">
            Sign in
          </Link>
          <Button asChild className="btn-sheen group h-12 rounded-full bg-primary px-6 text-[15px] sm:text-base font-semibold text-primary-foreground shadow-xs transition-all duration-300 hover:bg-black hover:scale-105 hover:shadow-md active:scale-95">
            <Link href="/#pricing">
              Book a Demo &rarr;
            </Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto rounded-full lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
        </Button>
      </nav>

      <div
        id="mobile-menu"
        hidden={!open}
        className="mt-2 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-3xl border border-border bg-surface p-4 shadow-xl lg:hidden"
      >
        <div className="grid gap-1.5">
          {productLinks.map((l) => (
            <Link key={l.href} href={l.href} onClick={close} className={cn(navLink, "text-base py-2")}>
              {l.label}
            </Link>
          ))}
          <p className="mt-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Policies</p>
          {policyLinks.map((l) => (
            <Link key={l.href} href={l.href} onClick={close} className={cn(navLink, "text-base py-2")}>
              {l.label}
            </Link>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/login" onClick={close}>
                Sign in
              </Link>
            </Button>
            <Button asChild className="rounded-full bg-primary text-white hover:bg-black">
              <Link href="/#pricing" onClick={close}>
                Book a Demo
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
