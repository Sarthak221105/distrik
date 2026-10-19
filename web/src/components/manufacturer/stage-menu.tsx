"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, ChevronDown, Lock } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { STAGES } from "@/components/domain/badges";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import type { Enums } from "@/lib/database.types";

export type Stage = Enums<"prospect_stage">;
export const ALL_STAGES: Stage[] = [...STAGES, "lost"];
export const ORDER_STAGES: Stage[] = ["first_order", "repeat_order"];

/** Allowed pipeline transitions (the same table set_stage validates against). */
export function useStageTransitions() {
  const supabase = getSupabaseBrowser();
  const q = useQuery({
    queryKey: ["stage-transitions"],
    queryFn: async () => unwrap(await supabase.from("stage_transitions").select("from_stage, to_stage")),
    staleTime: Infinity,
  });
  const allowed = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of q.data ?? []) {
      if (!m.has(r.from_stage)) m.set(r.from_stage, new Set());
      m.get(r.from_stage)!.add(r.to_stage);
    }
    return m;
  }, [q.data]);
  return { ...q, allowed };
}

export function stageBlockReason(from: Stage, to: Stage, allowed: Map<string, Set<string>>): string | null {
  if (from === to) return "Current stage";
  if (ORDER_STAGES.includes(to)) return "Reached only by confirming an order from a PO";
  if (allowed.size > 0 && !allowed.get(from)?.has(to)) return `Not allowed from ${t(`stage.${from}`)}`;
  return null;
}

/** Accessible "Move to…" menu; blocked targets stay visible with the reason. */
export function StageMenu({
  stage,
  onSelect,
  disabled,
  label = "Move to…",
  size = "sm",
  variant = "outline",
  prospectName,
}: {
  stage: Stage;
  onSelect: (to: Stage) => void;
  disabled?: boolean;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  prospectName?: string;
}) {
  const { allowed } = useStageTransitions();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={size}
          variant={variant}
          disabled={disabled}
          aria-label={prospectName ? `Move ${prospectName} to another stage` : undefined}
        >
          {size === "icon" ? <ArrowRightLeft aria-hidden /> : <>{label} <ChevronDown aria-hidden /></>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>From {t(`stage.${stage}`)} to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ALL_STAGES.map((to) => {
          const reason = stageBlockReason(stage, to, allowed);
          return (
            <DropdownMenuItem
              key={to}
              disabled={!!reason}
              onSelect={() => onSelect(to)}
              className="flex-col items-start gap-0 data-[disabled]:opacity-60"
            >
              <span className="flex items-center gap-1.5 font-medium">
                {reason && to !== stage && <Lock className="size-3" aria-hidden />}
                {t(`stage.${to}`)}
              </span>
              {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
