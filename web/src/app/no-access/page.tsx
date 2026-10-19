import { SignOutButton } from "@/components/shell/sign-out-button";

export default function NoAccessPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="grid max-w-sm gap-3 text-center">
        <h1 className="text-xl font-semibold">No workspace yet</h1>
        <p className="text-sm text-muted-foreground">
          Your account is not linked to a manufacturer. Ask your company owner to invite you, or contact support.
        </p>
        <div className="flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
