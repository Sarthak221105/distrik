"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, Phone } from "lucide-react";
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

  // Email form state
  const [email, setEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);

  // Phone form state
  const [phone, setPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);

  // Password form state
  const [password, setPassword] = useState("");

  const done = () => {
    router.replace(next && next.startsWith("/") && next !== "/" ? next : "/dashboard");
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

      <Tabs defaultValue="email">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="email">
            <Mail className="size-3.5" aria-hidden /> Email OTP
          </TabsTrigger>
          <TabsTrigger value="phone">
            <Phone className="size-3.5" aria-hidden /> Mobile
          </TabsTrigger>
          <TabsTrigger value="password">
            <KeyRound className="size-3.5" aria-hidden /> Password
          </TabsTrigger>
        </TabsList>

        {/* Email OTP Sign In */}
        <TabsContent value="email">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const cleanEmail = email.trim().toLowerCase();
                if (!cleanEmail) throw new Error("Please enter your work email");

                if (!emailOtpSent) {
                  const { error } = await supabase.auth.signInWithOtp({
                    email: cleanEmail,
                    options: { shouldCreateUser: false },
                  });
                  if (error) throw error;
                  setEmailOtpSent(true);
                  setInfo("We sent a 6-digit code to your email.");
                } else {
                  const cleanOtp = emailOtp.trim();
                  if (!cleanOtp || cleanOtp.length !== 6) throw new Error("Please enter the 6-digit code");

                  // Try standard email OTP
                  let res = await supabase.auth.verifyOtp({
                    email: cleanEmail,
                    token: cleanOtp,
                    type: "email",
                  });

                  // If standard email OTP fails, try invite type in case user is using their workspace activation code
                  if (res.error) {
                    const inviteRes = await supabase.auth.verifyOtp({
                      email: cleanEmail,
                      token: cleanOtp,
                      type: "invite",
                    });
                    if (!inviteRes.error) {
                      res = inviteRes;
                    }
                  }

                  if (res.error) throw res.error;
                  done();
                }
              });
            }}
          >
            <Field label="Work email" htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={emailOtpSent}
                required
              />
            </Field>

            {emailOtpSent && (
              <Field label="6-digit verification code" htmlFor="email-otp">
                <Input
                  id="email-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  required
                />
              </Field>
            )}

            <Button type="submit" loading={busy} size="lg">
              {emailOtpSent ? "Verify and sign in" : "Send sign-in code"}
            </Button>

            <div className="flex items-center justify-between text-xs">
              {emailOtpSent ? (
                <Button
                  type="button"
                  variant="link"
                  className="p-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEmailOtpSent(false);
                    setEmailOtp("");
                  }}
                >
                  Use a different email
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  className="p-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setEmailOtpSent(true)}
                >
                  Have an invite / activation code?
                </Button>
              )}
            </div>
          </form>
        </TabsContent>

        {/* Mobile Phone OTP Sign In */}
        <TabsContent value="phone">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const normalized = normalizeIndianPhone(phone);
                if (!normalized) throw new Error("Enter a 10 digit Indian mobile number");
                if (!phoneOtpSent) {
                  const { error } = await supabase.auth.signInWithOtp({
                    phone: normalized,
                    options: { shouldCreateUser: false },
                  });
                  if (error) throw error;
                  setPhoneOtpSent(true);
                  setInfo("We sent a 6 digit code by SMS.");
                } else {
                  const { error } = await supabase.auth.verifyOtp({ phone: normalized, token: phoneOtp, type: "sms" });
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
                disabled={phoneOtpSent}
              />
            </Field>
            {phoneOtpSent && (
              <Field label="6-digit code" htmlFor="phone-otp">
                <Input
                  id="phone-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={phoneOtp}
                  onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                />
              </Field>
            )}
            <Button type="submit" loading={busy} size="lg">
              {phoneOtpSent ? "Verify and sign in" : "Send code"}
            </Button>
            {phoneOtpSent && (
              <Button type="button" variant="link" onClick={() => { setPhoneOtpSent(false); setPhoneOtp(""); }}>
                Use a different number
              </Button>
            )}
          </form>
        </TabsContent>

        {/* Password Sign In */}
        <TabsContent value="password">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
                if (error) throw error;
                done();
              });
            }}
          >
            <Field label="Email" htmlFor="pwd-email">
              <Input
                id="pwd-email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
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
