"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudOff, Phone, StickyNote } from "lucide-react";
import { useViewer } from "@/components/providers";
import { StagePill } from "@/components/domain/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { STAGE_TRANSITIONS } from "@/components/rep/helpers";
import { RpcError } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { t } from "@/lib/i18n";
import { useOnline } from "@/lib/offline/hooks";
import { submitOrQueue } from "@/lib/offline/queue";
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES, type CallOutcome, type MutationInput, type ProspectStage } from "@/lib/offline/types";
import { cn } from "@/lib/utils";

type Target = { prospectId: string; prospectName: string };

function useLeadWrite({ prospectId, prospectName }: Target) {
  const viewer = useViewer();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  async function write(input: MutationInput, labels: { done: string }): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await submitOrQueue({ ...input, userId: viewer.userId, prospectId, prospectName });
      if (res.queued) {
        toast.message("Saved offline, will sync", {
          description: "It is stored on this phone and goes to the server when you reconnect.",
          icon: <CloudOff className="size-4" aria-hidden />,
        });
      } else {
        toast.success(labels.done);
        qc.invalidateQueries({ queryKey: qk.prospect(prospectId) });
        qc.invalidateQueries({ queryKey: qk.prospects() });
        qc.invalidateQueries({ queryKey: ["rep-today"] });
      }
      return true;
    } catch (e) {
      const err = e instanceof RpcError ? { message: e.message, field: e.field } : { message: e instanceof Error ? e.message : "Could not save" };
      setError(err);
      toast.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { write, busy, error };
}

function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function CallLogForm(target: Target) {
  const online = useOnline();
  const { write, busy, error } = useLeadWrite(target);
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  const [notes, setNotes] = useState("");
  const [followup, setFollowup] = useState("");
  const [touched, setTouched] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="size-4 text-muted-foreground" aria-hidden /> Log a call
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setTouched(true);
            if (!outcome) return;
            const ok = await write(
              { kind: "call_log", payload: { outcome, notes: notes.trim(), nextFollowup: followup || null } },
              { done: "Call logged" },
            );
            if (ok) {
              setOutcome("");
              setNotes("");
              setFollowup("");
              setTouched(false);
            }
          }}
        >
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Outcome</legend>
            <div className="flex flex-wrap gap-2">
              {CALL_OUTCOMES.map((o) => (
                <label
                  key={o}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                    outcome === o ? "border-primary bg-primary-soft font-medium text-primary" : "border-border bg-surface",
                  )}
                >
                  <input
                    type="radio"
                    name="call-outcome"
                    value={o}
                    checked={outcome === o}
                    onChange={() => setOutcome(o)}
                    className="sr-only"
                  />
                  {CALL_OUTCOME_LABELS[o]}
                </label>
              ))}
            </div>
            {touched && !outcome && (
              <p className="text-xs text-danger" role="alert">
                Choose how the call went.
              </p>
            )}
          </fieldset>
          <Field label="Notes" htmlFor="call-notes" hint="What did they say? Volumes, objections, who decides.">
            <Textarea id="call-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
          <Field label="Next follow up" htmlFor="call-followup" hint="Optional. Shows on the lead timeline.">
            <Input
              id="call-followup"
              type="date"
              min={todayISO()}
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              className="h-11"
            />
          </Field>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error.message}
            </p>
          )}
          <Button type="submit" size="lg" loading={busy}>
            {online ? "Save call log" : "Save offline"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function NoteForm(target: Target) {
  const online = useOnline();
  const { write, busy, error } = useLeadWrite(target);
  const [body, setBody] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StickyNote className="size-4 text-muted-foreground" aria-hidden /> Add a note
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            const ok = await write({ kind: "note", payload: { body: body.trim() } }, { done: "Note added" });
            if (ok) setBody("");
          }}
        >
          <Field label="Note" htmlFor="lead-note" error={error?.message}>
            <Textarea id="lead-note" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          </Field>
          <Button type="submit" variant="outline" size="lg" loading={busy} disabled={!body.trim()}>
            {online ? "Save note" : "Save note offline"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function StageSheet({
  open,
  onOpenChange,
  current,
  ...target
}: Target & { open: boolean; onOpenChange: (open: boolean) => void; current: ProspectStage }) {
  const online = useOnline();
  const { write, busy, error } = useLeadWrite(target);
  const [to, setTo] = useState<ProspectStage | "">("");
  const [note, setNote] = useState("");
  const options = STAGE_TRANSITIONS[current] ?? [];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTo("");
      }}
      side="bottom"
      title="Change stage"
      description="First order and repeat order are set automatically when an order is confirmed from a PO."
    >
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!to) return;
          const ok = await write(
            { kind: "stage", payload: { to, from: current, note: note.trim() || null } },
            { done: `Moved to ${t(`stage.${to}`)}` },
          );
          if (ok) {
            setTo("");
            setNote("");
            onOpenChange(false);
          }
        }}
      >
        <p className="flex items-center gap-2 text-sm">
          Now: <StagePill stage={current} />
        </p>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">No manual moves are available from this stage.</p>
        ) : (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Move to</legend>
            {options.map((s) => (
              <label
                key={s}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                  to === s ? "border-primary bg-primary-soft" : "border-border",
                )}
              >
                <input type="radio" name="stage-to" value={s} checked={to === s} onChange={() => setTo(s)} className="size-4 accent-[var(--primary)]" />
                <StagePill stage={s} />
                {s === "lost" && <span className="text-xs text-muted-foreground">Closes the lead</span>}
              </label>
            ))}
          </fieldset>
        )}
        <Field label="Note (optional)" htmlFor="stage-note">
          <Textarea id="stage-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </Field>
        {!online && (
          <p className="text-xs text-warning">
            You are offline. The change is saved now and checked by the server when it syncs; if it is no longer valid you will see why.
          </p>
        )}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error.message}
          </p>
        )}
        <Button type="submit" size="lg" loading={busy} disabled={!to}>
          {to ? `Move to ${t(`stage.${to}`)}` : "Choose a stage"}
        </Button>
      </form>
    </Sheet>
  );
}
