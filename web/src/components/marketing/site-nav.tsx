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
  "rounded-full px-3 py-1.5 text-[13.5px] sm:text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-surface-muted";

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const updateScrollState = () => {
      // Transition as soon as the user scrolls away from the top (> 15px)
      setIsScrolled(window.scrollY > 15);
    };

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
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
    <header className={cn(CONTAINER, "sticky top-0 z-40 pt-2.5 sm:pt-3.5")}>
      <nav
        aria-label="Main"
        className={cn(
          "w-full flex h-[54px] sm:h-[60px] items-center gap-3.5 sm:gap-4 rounded-full border px-4 sm:px-6 transition-all duration-300 ease-out",
          open || isScrolled
            ? "border-border/60 bg-surface/80 shadow-md backdrop-blur-lg backdrop-saturate-150 supports-[backdrop-filter]:bg-surface/75"
            : "border-border/80 bg-surface shadow-2xs",
        )}
      >
        <Logo />

        <ul className="ml-4 sm:ml-6 hidden items-center gap-1 lg:flex">
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
                Policies <ChevronDown className="size-3.5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-52 rounded-xl border-border bg-surface shadow-lg">
                {policyLinks.map((l) => (
                  <DropdownMenuItem key={l.href} asChild>
                    <Link href={l.href} className="text-sm">{l.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/policies" className="text-sm">All policies</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>

        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <Link href="/login" className="text-[13.5px] sm:text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Sign in
          </Link>
          <Button asChild className="btn-sheen group h-9 sm:h-10 rounded-full bg-primary px-4.5 sm:px-5 text-xs sm:text-sm font-semibold text-primary-foreground shadow-xs transition-all duration-300 hover:bg-black hover:scale-105 hover:shadow-md active:scale-95">
            <Link href="/#pricing">
              Book a Demo &rarr;
            </Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-9 rounded-full lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="size-4.5" aria-hidden /> : <Menu className="size-4.5" aria-hidden />}
        </Button>
      </nav>

      <div
        id="mobile-menu"
        hidden={!open}
        className="mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-border bg-surface/95 p-3.5 shadow-xl backdrop-blur-md lg:hidden"
      >
        <div className="grid gap-1">
          {productLinks.map((l) => (
            <Link key={l.href} href={l.href} onClick={close} className={cn(navLink, "text-sm py-1.5")}>
              {l.label}
            </Link>
          ))}
          <p className="mt-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Policies</p>
          {policyLinks.map((l) => (
            <Link key={l.href} href={l.href} onClick={close} className={cn(navLink, "text-sm py-1.5")}>
              {l.label}
            </Link>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <Button asChild variant="outline" size="sm" className="rounded-full text-xs">
              <Link href="/login" onClick={close}>
                Sign in
              </Link>
            </Button>
            <Button asChild size="sm" className="rounded-full bg-primary text-white hover:bg-black text-xs">
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
