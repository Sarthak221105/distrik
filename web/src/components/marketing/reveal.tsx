"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fades and lifts its children in the first time they scroll into view.
 * Writes a data attribute instead of React state, so there is no re-render.
 * People who prefer reduced motion (and browsers without
 * IntersectionObserver) see the content immediately.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Milliseconds, for staggering items in a row. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.shown = "true";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.shown = "true";
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal=""
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "motion-safe:transition-[opacity,translate,filter] motion-safe:duration-[900ms] motion-safe:ease-[cubic-bezier(.22,1,.36,1)]",
        "motion-safe:[&:not([data-shown])]:translate-y-6 motion-safe:[&:not([data-shown])]:opacity-0 motion-safe:[&:not([data-shown])]:blur-[6px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
