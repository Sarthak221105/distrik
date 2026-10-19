import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary-foreground/15">D</span>
          Distrik
        </div>
        <div className="grid max-w-md gap-4">
          <h1 className="text-3xl font-semibold leading-tight">Your AI sales employee for new markets.</h1>
          <p className="text-primary-foreground/80">
            Upload a product, set your commercial rules, name a city. Distrik finds buyers, talks to them on WhatsApp,
            negotiates inside your limits and brings back only the decisions that need you.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">Data stays in India · Prices never leave your rules</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <p className="text-lg font-semibold text-primary">Distrik</p>
            <p className="text-sm text-muted-foreground">AI Sales OS for Indian manufacturers</p>
          </div>
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mb-6 text-sm text-muted-foreground">Use your work email or registered mobile number.</p>
          <LoginForm next={next} initialError={error} />
        </div>
      </section>
    </main>
  );
}
