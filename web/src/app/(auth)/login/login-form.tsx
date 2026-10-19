"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone, KeyRound } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function normalizeIndianPhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  return null;
}

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const [error, setError] = useState<string | undefined>(initialError);
  const [info, setInfo] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const done = () => {
    router.replace(next && next.startsWith("/") ? next : "/");
    router.refresh();
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {info && <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{info}</p>}
      <Tabs defaultValue="phone">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="phone">
            <Phone className="size-3.5" aria-hidden /> Mobile
          </TabsTrigger>
          <TabsTrigger value="magic">
            <Mail className="size-3.5" aria-hidden /> Email
          </TabsTrigger>
          <TabsTrigger value="password">
            <KeyRound className="size-3.5" aria-hidden /> Password
          </TabsTrigger>
        </TabsList>

        <TabsContent value="phone">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const normalized = normalizeIndianPhone(phone);
                if (!normalized) throw new Error("Enter a 10 digit Indian mobile number");
                if (!otpSent) {
                  const { error } = await supabase.auth.signInWithOtp({
                    phone: normalized,
                    options: { shouldCreateUser: false },
                  });
                  if (error) throw error;
                  setOtpSent(true);
                  setInfo("We sent a 6 digit code by SMS.");
                } else {
                  const { error } = await supabase.auth.verifyOtp({ phone: normalized, token: otp, type: "sms" });
                  if (error) throw error;
                  done();
                }
              });
            }}
          >
            <Field label="Mobile number" htmlFor="phone">
              <Input
                id="phone"
                inputMode="tel"
                autoComplete="tel"
                placeholder="98000 00001"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={otpSent}
              />
            </Field>
            {otpSent && (
              <Field label="Code" htmlFor="otp">
                <Input
                  id="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                />
              </Field>
            )}
            <Button type="submit" loading={busy} size="lg">
              {otpSent ? "Verify and sign in" : "Send code"}
            </Button>
            {otpSent && (
              <Button type="button" variant="link" onClick={() => { setOtpSent(false); setOtp(""); }}>
                Use a different number
              </Button>
            )}
          </form>
        </TabsContent>

        <TabsContent value="magic">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const { error } = await supabase.auth.signInWithOtp({
                  email,
                  options: {
                    shouldCreateUser: false,
                    emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next ?? "/")}`,
                  },
                });
                if (error) throw error;
                setInfo("Check your inbox for a sign in link.");
              });
            }}
          >
            <Field label="Work email" htmlFor="magic-email">
              <Input id="magic-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Button type="submit" loading={busy} size="lg">
              Email me a link
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="password">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                done();
              });
            }}
          >
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" loading={busy} size="lg">
              Sign in
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
