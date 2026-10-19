"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, toAppError, unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatINR, formatPhone, rupeesToPaise, titleCase } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Avatar, Switch } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { useTeam, type TeamMember } from "@/components/manufacturer/hooks";
import { PERMISSIONS } from "@/lib/permissions";

type Role = "sales_head" | "rep";

export function TeamSettings() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const isOwner = viewer.role === "owner";
  const team = useTeam();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [limits, setLimits] = useState<Record<string, string>>({});

  const update = useRpc(
    async (v: { userId: string; patch: { role?: Role; approval_limit_paise?: number | null; active?: boolean } }) =>
      unwrap(await supabase.from("profiles").update(v.patch).eq("user_id", v.userId).select("user_id").single()),
    {
      invalidate: [qk.team()],
      success: "Team member updated",
      onSuccess: (_d, v) => setLimits((l) => ({ ...l, [v.userId]: "" })),
    },
  );

  const limitValue = (m: TeamMember) =>
    limits[m.user_id] !== undefined && limits[m.user_id] !== "" ? limits[m.user_id]! : m.approval_limit_paise === null ? "" : String(m.approval_limit_paise / 100);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Sales heads approve deals up to their limit and review leads with the permissions you give them. Reps see only the leads assigned to them.
          {!isOwner && " Only the owner can change roles and limits."}
        </p>
        {isOwner && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus aria-hidden /> Invite
          </Button>
        )}
      </div>
      {team.isLoading ? (
        <LoadingSkeleton variant="table" rows={4} />
      ) : team.error ? (
        <ErrorState error={team.error} onRetry={() => team.refetch()} />
      ) : team.data!.length === 0 ? (
        <EmptyState title="No team members" description="Invite your sales head and reps." />
      ) : (
        <Card>
          <Table>
            <caption className="sr-only">Team members</caption>
            <THead>
              <TR>
                <TH scope="col">Member</TH>
                <TH scope="col">Role</TH>
                <TH scope="col">Approval limit (deal value)</TH>
                <TH scope="col">Active</TH>
              </TR>
            </THead>
            <TBody>
              {team.data!.map((m) => {
                const self = m.user_id === viewer.userId;
                const editable = isOwner && !self && m.role !== "owner";
                const name = m.full_name ?? m.email ?? "Member";
                return (
                  <TR key={m.user_id} className={m.active ? "" : "opacity-60"}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar name={name} />
                        <div>
                          <div className="font-medium">{name}{self && <span className="text-xs text-muted-foreground"> (you)</span>}</div>
                          <div className="text-xs text-muted-foreground">{[m.email, m.phone ? formatPhone(m.phone) : null].filter(Boolean).join(" · ")}</div>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {editable ? (
                        <NativeSelect
                          aria-label={`Role for ${name}`}
                          className="w-36"
                          value={m.role}
                          onChange={(e) => update.mutate({ userId: m.user_id, patch: { role: e.target.value as Role } })}
                        >
                          <option value="sales_head">Sales head</option>
                          <option value="rep">Rep</option>
                        </NativeSelect>
                      ) : (
                        titleCase(m.role)
                      )}
                    </TD>
                    <TD>
                      {editable ? (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const raw = limitValue(m).trim();
                            const p = raw === "" ? null : rupeesToPaise(raw);
                            if (p !== null && (!Number.isFinite(p) || p < 0)) return;
                            update.mutate({ userId: m.user_id, patch: { approval_limit_paise: p } });
                          }}
                        >
                          <span className="text-sm text-muted-foreground">₹</span>
                          <Input
                            aria-label={`Approval limit in rupees for ${name}`}
                            className="w-32"
                            inputMode="decimal"
                            placeholder="No limit"
                            value={limitValue(m)}
                            onChange={(e) => setLimits((l) => ({ ...l, [m.user_id]: e.target.value }))}
                          />
                          <Button type="submit" size="sm" variant="outline">Save</Button>
                        </form>
                      ) : m.role === "owner" ? (
                        <span className="text-sm">Unlimited</span>
                      ) : (
                        <span className="tabular">{m.approval_limit_paise === null ? "No limit" : formatINR(m.approval_limit_paise, { whole: true })}</span>
                      )}
                    </TD>
                    <TD>
                      <Switch
                        aria-label={`${name} is ${m.active ? "active" : "deactivated"}`}
                        checked={m.active}
                        disabled={!editable}
                        onCheckedChange={(v) => update.mutate({ userId: m.user_id, patch: { active: v } })}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Deactivated members are signed out of the app on their next token refresh and stop receiving leads.</p>
      {team.data && team.data.length > 0 && <LeadPermissions members={team.data} isOwner={isOwner} />}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const supabase = getSupabaseBrowser();
  const [form, setForm] = useState({ email: "", full_name: "", role: "rep" as Role, limit: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const invite = useRpc(
    async () => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "invite",
          email: form.email.trim().toLowerCase(),
          full_name: form.full_name.trim(),
          role: form.role,
          approval_limit_paise: form.limit ? rupeesToPaise(form.limit) : form.role === "rep" ? 0 : null,
          phone: form.phone.trim() || null,
        },
      });
      if (error) {
        // Edge function errors carry the JSON body in error.context
        let message = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.message) message = body.message;
        } catch {
          // keep the generic message
        }
        throw new RpcError({ ...toAppError(error), message });
      }
      return data;
    },
    {
      invalidate: [qk.team()],
      success: () => `Invitation sent to ${form.email}`,
      onSuccess: () => {
        setForm({ email: "", full_name: "", role: "rep", limit: "", phone: "" });
        onOpenChange(false);
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Invite a team member" description="They get an email to sign in. Reps use the mobile app; sales heads use this web app.">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const errs: Record<string, string> = {};
            if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = "Enter a valid email";
            if (form.full_name.trim().length < 2) errs.full_name = "Enter their name";
            if (form.limit && !Number.isFinite(rupeesToPaise(form.limit))) errs.limit = "Enter an amount in rupees";
            if (form.phone && !/^\+?[0-9 ]{10,15}$/.test(form.phone.trim())) errs.phone = "Enter a mobile number";
            setErrors(errs);
            if (Object.keys(errs).length === 0) invite.mutate(undefined);
          }}
        >
          <Field label="Full name" htmlFor="inv-name" error={errors.full_name}>
            <Input id="inv-name" value={form.full_name} aria-invalid={!!errors.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          </Field>
          <Field label="Email" htmlFor="inv-email" error={errors.email}>
            <Input id="inv-email" type="email" value={form.email} aria-invalid={!!errors.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Role" htmlFor="inv-role">
            <NativeSelect id="inv-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
              <option value="rep">Rep</option>
              <option value="sales_head">Sales head</option>
            </NativeSelect>
          </Field>
          <Field label="Mobile (optional)" htmlFor="inv-phone" error={errors.phone}>
            <Input id="inv-phone" inputMode="tel" value={form.phone} aria-invalid={!!errors.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Approval limit (₹ deal value)" htmlFor="inv-limit" error={errors.limit} hint="Empty means no limit for sales heads, ₹0 for reps" className="sm:col-span-2">
            <Input id="inv-limit" inputMode="decimal" value={form.limit} aria-invalid={!!errors.limit} onChange={(e) => setForm((f) => ({ ...f, limit: e.target.value }))} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={invite.isPending}>Send invitation</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lead permissions: the owner delegates the lead workflow to sales heads one
 * permission at a time (set_member_permissions). Reps always see only the
 * leads assigned to them.
 */
function LeadPermissions({ members, isOwner }: { members: TeamMember[]; isOwner: boolean }) {
  const supabase = getSupabaseBrowser();
  const heads = members.filter((m) => m.role === "sales_head");
  const reps = members.filter((m) => m.role === "rep");
  const save = useRpc(
    async (v: { userId: string; permissions: string[] }) =>
      unwrap(await supabase.rpc("set_member_permissions", { p_user: v.userId, p_permissions: v.permissions })),
    { invalidate: [qk.team()], success: "Permissions updated" },
  );

  return (
    <section aria-labelledby="perm-h" className="grid gap-3">
      <div>
        <h2 id="perm-h" className="text-sm font-semibold">Lead review permissions</h2>
        <p className="text-sm text-muted-foreground">
          Your team reviews, approves and launches its own leads. The owner always has every permission; choose what each sales head can do.
          {!isOwner && " Only the owner can change these."}
        </p>
      </div>
      {heads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sales heads yet. Invite one, or change a member&apos;s role to Sales head.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {heads.map((m) => {
            const name = m.full_name ?? m.email ?? "Sales head";
            const current = m.permissions ?? [];
            const pending = save.isPending && save.variables?.userId === m.user_id;
            return (
              <Card key={m.user_id} className="p-4">
                <fieldset className="grid gap-3" disabled={!isOwner || pending || !m.active}>
                  <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
                    <Avatar name={name} className="size-6" /> {name}
                    {!m.active && <span className="text-xs font-normal text-muted-foreground">(deactivated)</span>}
                  </legend>
                  {PERMISSIONS.map((p) => {
                    const on = current.includes(p.key);
                    const id = `perm-${m.user_id}-${p.key}`;
                    return (
                      <div key={p.key} className="flex items-start justify-between gap-3">
                        <label htmlFor={id} className="grid gap-0.5 text-sm">
                          <span className="font-medium">{p.label}</span>
                          <span id={`${id}-help`} className="text-xs text-muted-foreground">{p.help}</span>
                        </label>
                        <Switch
                          id={id}
                          aria-describedby={`${id}-help`}
                          checked={on}
                          onCheckedChange={(v) =>
                            save.mutate({ userId: m.user_id, permissions: v ? [...current, p.key] : current.filter((x) => x !== p.key) })
                          }
                        />
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {current.length === 0 ? "No lead permissions: can view prospects only." : `${current.length} of ${PERMISSIONS.length} permissions on.`}
                  </p>
                </fieldset>
              </Card>
            );
          })}
        </div>
      )}
      {reps.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Reps ({reps.length}) see only the approved leads assigned to them. They can flag a lead for a closer look and correct its details, but cannot
          approve, reject, merge or launch.
        </p>
      )}
    </section>
  );
}
