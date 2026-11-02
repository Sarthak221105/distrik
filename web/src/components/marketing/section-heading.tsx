import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-foreground shadow-2xs transition-all duration-300 hover:border-accent/40 hover:shadow-xs",
        className,
      )}
    >
      <span className="size-2 rounded-full bg-accent animate-pulse-dot" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  /** id of the h2, for aria-labelledby on the section. */
  id: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-4xl lg:max-w-5xl flex-col gap-4 sm:gap-5",
        align === "center" ? "mx-auto items-center text-center" : "items-start text-left",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="text-[28px] leading-[1.08] font-bold tracking-tight text-balance sm:text-[42px] md:text-[52px] lg:text-[62px] xl:text-[70px] 2xl:text-[75px] text-foreground">
        {title}
      </h2>
      {description && <p className="text-base text-pretty text-muted-foreground sm:text-lg lg:text-[21px] leading-relaxed max-w-4xl">{description}</p>}
    </div>
  );
}

/** Standard responsive marketing container (75% proportional scale: max-w ~1240px with comfortable gutters). */
export const CONTAINER = "mx-auto w-[92vw] max-w-[1240px] px-3.5 sm:px-5 lg:px-7";

/** Standard horizontal container for marketing sections. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(CONTAINER, className)}>{children}</div>;
}
