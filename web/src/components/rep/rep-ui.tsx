"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StagePill } from "@/components/domain/badges";
import { ErrorState, Skeleton } from "@/components/domain/states";
import { cn } from "@/lib/utils";

export function RepSection({
  id,
  title,
  icon,
  count,
  description,
  children,
  isLoading,
  error,
  onRetry,
  tone = "default",
}: {
  id: string;
  title: string;
  icon: ReactNode;
  count?: number;
  description?: string;
  children: ReactNode;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  tone?: "default" | "urgent";
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="grid scroll-mt-20 gap-2">
      <div className="flex items-center gap-2">
        <span className={cn("[&_svg]:size-4", tone === "urgent" ? "text-danger" : "text-muted-foreground")} aria-hidden>
          {icon}
        </span>
        <h2 id={`${id}-h`} className="text-sm font-semibold">
          {title}
        </h2>
        {count !== undefined && !isLoading && (
          <span className="rounded-full bg-surface-muted px-2 text-xs font-medium tabular text-muted-foreground">{count}</span>
        )}
      </div>
      {description && <p className="-mt-1 text-xs text-muted-foreground">{description}</p>}
      {isLoading ? (
        <div className="grid gap-2" aria-busy="true" aria-label={`Loading ${title}`}>
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : error ? (
        <ErrorState title={`Could not load ${title.toLowerCase()}`} error={error} onRetry={onRetry} className="py-6" />
      ) : (
        children
      )}
    </section>
  );
}

export function LeadRow({
  href,
  name,
  city,
  stage,
  detail,
  meta,
  badge,
}: {
  href: string;
  name: string;
  city?: string | null;
  stage?: string | null;
  detail?: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 hover:border-primary/40"
      >
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{name}</span>
            {stage && <StagePill stage={stage} />}
            {badge}
          </div>
          {(city || meta) && (
            <span className="truncate text-xs text-muted-foreground">
              {[city, meta].filter(Boolean).map((x, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {x}
                </span>
              ))}
            </span>
          )}
          {detail && <span className="line-clamp-2 text-sm text-muted-foreground">{detail}</span>}
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function SectionEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{children}</p>;
}
