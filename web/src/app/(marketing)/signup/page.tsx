import type { Metadata } from "next";
import { SignupForm } from "@/components/signup/signup-form";

export const metadata: Metadata = { title: "Create your workspace" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string; cycle?: string }> }) {
  const { plan, cycle } = await searchParams;
  return <SignupForm initialPlan={plan} initialCycle={cycle === "yearly" ? "yearly" : "monthly"} />;
}
