"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl",
          className,
        )}
        {...props}
      >
        <div className="grid gap-1 pr-6">
          <D.Title className="text-base font-semibold">{title}</D.Title>
          <D.Description className={description ? "text-sm text-muted-foreground" : "sr-only"}>
            {description ?? title}
          </D.Description>
        </div>
        {children}
        <D.Close
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-surface-muted"
          aria-label="Close"
        >
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = "right",
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  side?: "right" | "bottom";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content
          className={cn(
            "fixed z-50 flex flex-col gap-4 overflow-y-auto border-border bg-surface p-5 shadow-xl",
            side === "right"
              ? "inset-y-0 right-0 w-full max-w-xl border-l"
              : "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t",
            className,
          )}
        >
          <div className="grid gap-1 pr-8">
            <D.Title className="text-base font-semibold">{title}</D.Title>
            <D.Description className={description ? "text-sm text-muted-foreground" : "sr-only"}>
              {description ?? title}
            </D.Description>
          </div>
          {children}
          <D.Close
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-surface-muted"
            aria-label="Close"
          >
            <X className="size-4" />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
