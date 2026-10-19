import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Verify" };

// Landing page for expired or invalid sign in links.
export default function VerifyPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="grid max-w-sm gap-3 text-center">
        <h1 className="text-xl font-semibold">Check your link</h1>
        <p className="text-sm text-muted-foreground">
          This sign in link has expired or was already used. Request a new one, or sign in with your mobile number.
        </p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
