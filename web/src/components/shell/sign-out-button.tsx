"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton({ variant = "outline" }: { variant?: "outline" | "ghost" }) {
  const router = useRouter();
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={async () => {
        await getSupabaseBrowser().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut aria-hidden /> Sign out
    </Button>
  );
}
