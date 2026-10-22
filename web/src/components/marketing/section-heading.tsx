import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary",
        className,
      )}
    >
      {children}
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
        "flex max-w-2xl flex-col gap-4",
        align === "center" ? "mx-auto items-center text-center" : "items-start text-left",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="text-[34px] leading-[1.15] font-medium tracking-tight text-balance sm:text-[40px] lg:text-h2">
        {title}
      </h2>
      {description && <p className="text-base text-pretty text-muted-foreground sm:text-lg">{description}</p>}
    </div>
  );
}

/** Wide marketing container: fills laptop and desktop screens, with gutters that grow with the viewport. */
export const CONTAINER = "mx-auto w-full max-w-[1800px] px-3 sm:px-5 lg:px-8 2xl:px-10";

/** Standard horizontal container for marketing sections. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(CONTAINER, className)}>{children}</div>;
}
