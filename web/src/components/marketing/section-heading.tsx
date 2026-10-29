import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-5 py-2 text-xs sm:text-base font-semibold text-foreground shadow-2xs transition-all duration-300 hover:border-accent/40 hover:shadow-xs",
        className,
      )}
    >
      <span className="size-2.5 rounded-full bg-accent animate-pulse-dot" aria-hidden />
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
        "flex max-w-5xl lg:max-w-6xl 2xl:max-w-7xl flex-col gap-6",
        align === "center" ? "mx-auto items-center text-center" : "items-start text-left",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="text-[38px] leading-[1.03] font-bold tracking-tight text-balance sm:text-[58px] md:text-[72px] lg:text-[84px] xl:text-[94px] 2xl:text-[100px] text-foreground">
        {title}
      </h2>
      {description && <p className="text-xl text-pretty text-muted-foreground sm:text-2xl lg:text-[28px] leading-relaxed max-w-5xl">{description}</p>}
    </div>
  );
}

/** Wide marketing container: 94-96vw with ~1600px max-width, maintaining clean 24-40px gutters. */
export const CONTAINER = "mx-auto w-[95vw] max-w-[1600px] px-4 sm:px-6 lg:px-8";

/** Standard horizontal container for marketing sections. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(CONTAINER, className)}>{children}</div>;
}
