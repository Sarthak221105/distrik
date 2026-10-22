import type { Metadata } from "next";
import { requireViewer } from "@/lib/viewer";
import { homeForRole } from "@/lib/claims";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome" };

// First stop after an invite email: set a password (optional, since phone OTP
// and email links keep working) and continue into the workspace.
export default async function WelcomePage() {
  const viewer = await requireViewer();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-lg">
        <p className="text-sm font-semibold text-primary">Distrik</p>
        <h1 className="mt-2 text-h4 font-medium">
          Welcome{viewer.fullName ? `, ${viewer.fullName.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {viewer.manufacturer
            ? `Your ${viewer.manufacturer.name} workspace is ready.`
            : "Your account is ready."}{" "}
          Set a password so you can sign in with your email next time.
        </p>
        <WelcomeForm email={viewer.email} next={homeForRole(viewer.role)} />
      </div>
    </main>
  );
}
