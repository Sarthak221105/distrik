"use client";

import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { RpcError } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { publicApi, type PublicStats } from "@/lib/plans";
import { publicStatsKey } from "./use-public-stats";

type Values = { email: string; name: string; company: string; website: string };
type FieldName = "email" | "name" | "company";
type Joined = { joined: boolean; position: number; waitlist_count: number };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function WaitlistForm() {
  const ids = { email: useId(), name: useId(), company: useId(), form: useId() };
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Values>({ email: "", name: "", company: "", website: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<Joined | null>(null);

  const join = useMutation({
    mutationFn: (v: Values) =>
      publicApi.joinWaitlist({
        email: v.email.trim(),
        name: v.name.trim() || undefined,
        company: v.company.trim() || undefined,
        website: v.website,
      }),
    onSuccess: (data) => {
      setResult(data);
      queryClient.setQueryData<PublicStats>(publicStatsKey, (old) =>
        old ? { ...old, waitlist_count: Math.max(old.waitlist_count, data.waitlist_count) } : old,
      );
      void queryClient.invalidateQueries({ queryKey: publicStatsKey });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      const field = err instanceof RpcError ? err.field : undefined;
      if (field === "email" || field === "name" || field === "company") {
        setFieldErrors({ [field]: message });
        document.getElementById(ids[field])?.focus();
      } else {
        setFormError(message);
      }
    },
  });

  const set = (key: keyof Values) => (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    if (key !== "website" && fieldErrors[key]) setFieldErrors((f) => ({ ...f, [key]: undefined }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const email = values.email.trim();
    if (!email) {
      setFieldErrors({ email: "Enter your work email" });
      document.getElementById(ids.email)?.focus();
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setFieldErrors({ email: "Enter a valid email address, like you@company.in" });
      document.getElementById(ids.email)?.focus();
      return;
    }
    setFieldErrors({});
    join.mutate(values);
  };

  if (result) {
    return (
      <div role="status" className="grid justify-items-center gap-4 rounded-2xl border border-success/30 bg-success-soft/60 p-8 text-center">
        <CircleCheck className="size-10 text-success" aria-hidden />
        <div className="grid gap-1.5">
          <p className="text-xl font-semibold">
            {result.joined ? "You're" : "You're already"} #{formatNumber(result.position)} on the waitlist
          </p>
          <p className="text-sm text-muted-foreground">
            {formatNumber(result.waitlist_count)} {result.waitlist_count === 1 ? "manufacturer has" : "manufacturers have"}{" "}
            joined so far. We will email {values.email.trim()} when your spot opens.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/#pricing">Choose a plan</Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              join.reset();
            }}
          >
            Add another email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-describedby={formError ? `${ids.form}-error` : undefined}
      className="relative grid gap-4 rounded-2xl bg-surface p-6 shadow-xl sm:p-8"
    >
      <Field label="Work email" htmlFor={ids.email} error={fieldErrors.email}>
        <Input
          id={ids.email}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@company.in"
          value={values.email}
          onChange={set("email")}
          aria-invalid={fieldErrors.email ? true : undefined}
          className="h-11 text-base sm:text-sm"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name (optional)" htmlFor={ids.name} error={fieldErrors.name}>
          <Input
            id={ids.name}
            name="name"
            autoComplete="name"
            value={values.name}
            onChange={set("name")}
            aria-invalid={fieldErrors.name ? true : undefined}
            className="h-11 text-base sm:text-sm"
          />
        </Field>
        <Field label="Company (optional)" htmlFor={ids.company} error={fieldErrors.company}>
          <Input
            id={ids.company}
            name="company"
            autoComplete="organization"
            value={values.company}
            onChange={set("company")}
            aria-invalid={fieldErrors.company ? true : undefined}
            className="h-11 text-base sm:text-sm"
          />
        </Field>
      </div>

      {/* Honeypot: people never see or fill this; bots often do. */}
      <div aria-hidden="true" className="sr-only">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
        </label>
      </div>

      {formError && (
        <p
          id={`${ids.form}-error`}
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" loading={join.isPending} className="w-full">
        {join.isPending ? "Joining" : "Join the waitlist"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        We use your email only to contact you about Distrik. See our{" "}
        <Link href="/policies/privacy" className="font-medium text-primary underline-offset-4 hover:underline">
          privacy notice
        </Link>
        .
      </p>
    </form>
  );
}
