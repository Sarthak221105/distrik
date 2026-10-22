"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function WelcomeForm({ email, next }: { email: string | null; next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const go = () => {
    router.replace(next);
    router.refresh();
  };

  return (
    <form
      className="mt-6 grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < 8) return setError("Use at least 8 characters");
        if (password !== confirm) return setError("The passwords do not match");
        setBusy(true);
        setError(undefined);
        const { error: err } = await getSupabaseBrowser().auth.updateUser({ password });
        setBusy(false);
        if (err) return setError(err.message);
        go();
      }}
    >
      {email && (
        <Field label="Email" htmlFor="welcome-email">
          <Input id="welcome-email" value={email} readOnly autoComplete="username" />
        </Field>
      )}
      <Field label="New password" htmlFor="welcome-password" error={error}>
        <Input
          id="welcome-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error}
        />
      </Field>
      <Field label="Confirm password" htmlFor="welcome-confirm">
        <Input id="welcome-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        Save password and continue
      </Button>
      <Button type="button" variant="link" onClick={go}>
        Skip for now
      </Button>
    </form>
  );
}
