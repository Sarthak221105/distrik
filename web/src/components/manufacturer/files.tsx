"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText } from "lucide-react";
import { signedUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/domain/states";
import { cn } from "@/lib/utils";

const BUCKETS = ["catalogues", "quotations", "purchase-orders", "whatsapp-media"];

/**
 * Resolves a stored path to { bucket, key }. purchase_orders.file_path and
 * messages.media_path are "<bucket>/<key>"; older rows may omit the bucket,
 * in which case the fallback bucket is used.
 */
export function resolveStoragePath(path: string, fallbackBucket: string): { bucket: string; key: string } {
  const first = path.split("/")[0] ?? "";
  if (BUCKETS.includes(first)) return { bucket: first, key: path.slice(first.length + 1) };
  return { bucket: fallbackBucket, key: path };
}

export async function openStoredFile(path: string, fallbackBucket: string) {
  const { bucket, key } = resolveStoragePath(path, fallbackBucket);
  const url = await signedUrl(bucket, key, 600);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  return url;
}

/** Inline preview of a private file through a short lived signed URL. */
export function SignedFileFrame({
  path,
  fallbackBucket,
  mime,
  title,
  className,
}: {
  path: string;
  fallbackBucket: string;
  mime?: string | null;
  title: string;
  className?: string;
}) {
  const { bucket, key } = resolveStoragePath(path, fallbackBucket);
  const url = useQuery({
    queryKey: ["signed-url", bucket, key],
    queryFn: async () => {
      const u = await signedUrl(bucket, key, 3600);
      if (!u) throw new Error("The file could not be opened. It may not have been uploaded yet.");
      return u;
    },
    staleTime: 30 * 60_000,
    retry: 0,
  });

  if (url.isLoading) return <Skeleton className={cn("h-[600px] w-full", className)} />;
  if (url.error || !url.data)
    return (
      <ErrorState
        className={className}
        title="File not available"
        error={url.error}
        onRetry={() => url.refetch()}
      />
    );
  const isImage = (mime ?? "").startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(key);
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <FileText className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{key.split("/").pop()}</span>
        </span>
        <Button asChild variant="link" size="sm">
          <a href={url.data} target="_blank" rel="noopener noreferrer">
            Open in new tab <ExternalLink aria-hidden />
          </a>
        </Button>
      </div>
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url.data} alt={title} className="max-h-[720px] w-full rounded-lg border border-border object-contain" />
      ) : (
        <iframe src={url.data} title={title} className="h-[720px] w-full rounded-lg border border-border bg-surface-muted" />
      )}
    </div>
  );
}

/** Client side CSV download (Data export). */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80);
}
