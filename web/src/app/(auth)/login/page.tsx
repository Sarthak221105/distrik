import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { Logo, LogoMark } from "@/components/marketing/logo";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative isolate hidden flex-col justify-between overflow-hidden bg-band p-12 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(36rem_22rem_at_100%_0%,rgb(108_132_252/0.45),transparent_70%),radial-gradient(28rem_18rem_at_0%_100%,rgb(40_81_235/0.4),transparent_70%)]"
        />
        <Logo variant="white" className="w-fit" />
        <div className="grid max-w-md gap-4">
          <h1 className="text-h3 font-medium sm:text-[40px] sm:leading-[1.15]">Your AI sales employee for new markets.</h1>
          <p className="text-white/80">
            Upload a product, set your commercial rules, name a city. Distrik finds buyers, talks to them on WhatsApp,
            negotiates inside your limits and brings back only the decisions that need you.
          </p>
        </div>
        <p className="text-sm text-white/70">Data stays in India · Prices never leave your rules</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-lg">
          <div className="mb-8 lg:hidden">
            <Logo />
            <p className="mt-1 text-sm text-muted-foreground">AI Sales OS for Indian manufacturers</p>
          </div>
          <h2 className="text-h4 font-medium">Sign in</h2>
          <p className="mb-6 text-sm text-muted-foreground">Use your work email or registered mobile number.</p>
          <LoginForm next={next} initialError={error} />
        </div>
      </section>
    </main>
  );
}
