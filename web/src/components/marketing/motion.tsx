"use client";

import { Fragment, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Tilts its child back in 3D and flattens it as it scrolls into view (the
 * product shot in the hero). Writes a CSS variable per frame, no re-renders.
 * Reduced motion: shown flat, no scroll work at all.
 */
export function ScrollTilt({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      el.style.setProperty("--tilt", "1");
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const top = el.getBoundingClientRect().top;
      const vh = window.innerHeight;
      // 0 while the top of the shot sits at the bottom of the screen, 1 once it reaches the upper fifth.
      const p = Math.min(1, Math.max(0, (vh - top) / (vh * 0.8)));
      el.style.setProperty("--tilt", p.toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={cn("[perspective:1800px]", className)} style={{ "--tilt": 0 } as CSSProperties}>
      <div
        className="origin-top will-change-transform"
        style={{
          transform:
            "rotateX(calc((1 - var(--tilt)) * 14deg)) scale(calc(0.93 + var(--tilt) * 0.07)) translateY(calc((1 - var(--tilt)) * 24px))",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Splits a heading into words that rise in one after another on load. */
export function StaggerWords({ text, start = 0, step = 55, className }: { text: string; start?: number; step?: number; className?: string }) {
  const words = text.split(" ");
  return words.map((word, i) => (
    <Fragment key={`${word}-${i}`}>
      <span className={cn("animate-enter inline-block", className)} style={{ "--d": `${start + i * step}ms` } as CSSProperties}>
        {word}
      </span>
      {i < words.length - 1 ? " " : null}
    </Fragment>
  ));
}
