"use client";

import { useId, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type FaqItem = { q: string; a: ReactNode };

/** Single-open accordion. Collapsed answers are inert, so they stay out of tab order and the a11y tree. */
export function FaqAccordion({ items, className }: { items: FaqItem[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();

  return (
    <div className={cn("divide-y divide-border rounded-2xl bg-surface shadow-sm", className)}>
      {items.map((item, i) => {
        const isOpen = open === i;
        const btnId = `${base}-q${i}`;
        const panelId = `${base}-a${i}`;
        return (
          <div key={item.q}>
            <h3>
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
                className="group flex w-full items-center gap-4 rounded-2xl px-6 py-6 text-left text-lg sm:text-xl font-bold transition-colors hover:text-accent sm:px-8"
              >
                <span className="flex-1">{item.q}</span>
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border border-border transition-[transform,background-color,color] duration-300",
                    isOpen ? "rotate-45 border-primary bg-primary text-primary-foreground" : "group-hover:bg-surface-muted",
                  )}
                  aria-hidden
                >
                  <Plus className="size-4.5" />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              inert={!isOpen}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <div className="grid gap-3.5 px-6 pb-7 text-base sm:text-lg leading-relaxed text-muted-foreground sm:px-8 [&_a]:font-medium [&_a]:text-accent [&_a]:underline-offset-4 hover:[&_a]:underline">
                  {item.a}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
