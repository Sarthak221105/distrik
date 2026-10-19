"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { t } from "@/lib/i18n";
import { titleCase } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useViewer } from "@/components/providers";
import { NativeSelect } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TierBadge } from "@/components/domain/badges";
import { ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { unwrapList } from "@/components/manufacturer/hooks";
import type { Enums } from "@/lib/database.types";

type Tier = Enums<"autonomy_tier">;
const TIERS: Tier[] = ["autonomous", "approval", "human_only"];

/** Fixed by the database: these can never be loosened, whatever the owner picks. */
function lockReason(action: string): { allowed: Tier[]; reason: string } | null {
  if (action === "contract_change" || action === "legal_commitment")
    return { allowed: ["human_only"], reason: "Always human only" };
  if (action === "price_below_floor") return { allowed: ["approval", "human_only"], reason: "Never autonomous: prices below the floor always need a person" };
  return null;
}

const ORDER: Record<Tier, number> = { autonomous: 0, approval: 1, human_only: 2 };

/** AutonomyPolicyEditor: which actions the AI may take alone, per manufacturer. Owner edits. */
export function AutonomyPolicyEditor() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const isOwner = viewer.role === "owner";
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const policies = useQuery({
    queryKey: qk.autonomy(),
    queryFn: async () => unwrapList(await supabase.from("autonomy_policies").select("*").order("action_type")),
  });

  const save = useRpc(
    async (v: { id: string; tier: Tier }) =>
      unwrap(await supabase.from("autonomy_policies").update({ tier: v.tier }).eq("id", v.id).select("id").single()),
    {
      invalidate: [qk.autonomy()],
      success: (_d, v) => `Policy set to ${t(`tier.${v.tier}`)}`,
      onSuccess: (_d, v) => setRowError((e) => ({ ...e, [v.id]: "" })),
      onError: (e, v) => setRowError((r) => ({ ...r, [v.id]: e.message })),
    },
  );

  if (policies.isLoading) return <LoadingSkeleton variant="table" rows={6} />;
  if (policies.error) return <ErrorState error={policies.error} onRetry={() => policies.refetch()} />;
  const rows = [...policies.data!].sort((a, b) => ORDER[a.tier] - ORDER[b.tier] || a.action_type.localeCompare(b.action_type));

  return (
    <div className="grid gap-2">
      {!isOwner && <p className="text-xs text-muted-foreground">Only the owner can change autonomy policies.</p>}
      <Table>
        <caption className="sr-only">Autonomy policies</caption>
        <THead>
          <TR>
            <TH scope="col">Action</TH>
            <TH scope="col">Current tier</TH>
            <TH scope="col" className="w-64">Change</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((p) => {
            const lock = lockReason(p.action_type);
            const fullyLocked = lock?.allowed.length === 1;
            return (
              <TR key={p.id}>
                <TD>
                  <div className="font-medium">{p.description ?? titleCase(p.action_type)}</div>
                  <div className="font-mono text-xs text-muted-foreground">{p.action_type}</div>
                </TD>
                <TD><TierBadge tier={p.tier} /></TD>
                <TD>
                  {fullyLocked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3" aria-hidden /> {lock!.reason}
                    </span>
                  ) : (
                    <div className="grid gap-1">
                      <NativeSelect
                        aria-label={`Tier for ${p.description ?? p.action_type}`}
                        value={p.tier}
                        disabled={!isOwner || (save.isPending && save.variables?.id === p.id)}
                        onChange={(e) => save.mutate({ id: p.id, tier: e.target.value as Tier })}
                      >
                        {TIERS.map((tier) => (
                          <option key={tier} value={tier} disabled={!!lock && !lock.allowed.includes(tier)}>
                            {t(`tier.${tier}`)}
                            {lock && !lock.allowed.includes(tier) ? " (not allowed)" : ""}
                          </option>
                        ))}
                      </NativeSelect>
                      {lock && <span className="text-[11px] text-muted-foreground">{lock.reason}</span>}
                      {rowError[p.id] && <span role="alert" className="text-xs text-danger">{rowError[p.id]}</span>}
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Whatever the policy, the AI only ever quotes prices returned by the pricing rules, and a price below the floor never goes out without a person.
      </p>
    </div>
  );
}
