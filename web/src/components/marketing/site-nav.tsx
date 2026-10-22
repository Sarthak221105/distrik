"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
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
  "rounded-md px-3 py-2 text-base font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground";

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
    <header className={cn(CONTAINER, "sticky top-0 z-40 pt-3 sm:pt-4")}>
      <nav
        aria-label="Main"
        className={cn(
          "flex h-16 items-center gap-4 rounded-2xl border px-3 transition-[background-color,border-color,box-shadow,height] duration-500 ease-[cubic-bezier(.22,1,.36,1)] sm:h-[72px] sm:px-5",
          scrolled || open
            ? "border-white/70 bg-surface/85 shadow-lg backdrop-blur-xl sm:h-16 dark:border-border"
            : "border-white/60 bg-surface/55 shadow-sm backdrop-blur-md dark:border-border/60",
        )}
      >
        <Logo />

        <ul className="ml-6 hidden items-center gap-1 lg:flex">
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
              <DropdownMenuContent align="start" className="min-w-56">
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

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <Link href="/login" className={navLink}>
            Sign in
          </Link>
          <Button asChild className="btn-sheen h-11 rounded-xl bg-band px-5 text-base text-white hover:bg-band/90 dark:bg-primary dark:text-primary-foreground">
            <Link href="/#pricing">Get started</Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto lg:hidden"
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
        className="mt-2 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-border bg-surface shadow-xl lg:hidden"
      >
        <div className="grid gap-1 p-3">
          {productLinks.map((l) => (
            <Link key={l.href} href={l.href} onClick={close} className={cn(navLink, "text-base")}>
              {l.label}
            </Link>
          ))}
          <p className="mt-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Policies</p>
          {policyLinks.map((l) => (
            <Link key={l.href} href={l.href} onClick={close} className={cn(navLink, "text-base")}>
              {l.label}
            </Link>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
            <Button asChild variant="outline" size="lg">
              <Link href="/login" onClick={close}>
                Sign in
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link href="/#pricing" onClick={close}>
                Get started
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
