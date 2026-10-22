import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";

// Email links (team invites and self-serve workspace activation) carry a
// token hash. Verifying it signs the person in with a session cookie; new
// accounts continue to /welcome to set a password.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "invite") as EmailOtpType;
  const next = url.searchParams.get("next");
  if (tokenHash) {
    const supabase = await getSupabaseServer();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      const target = next && next.startsWith("/") ? next : type === "invite" || type === "signup" ? "/welcome" : "/";
      return NextResponse.redirect(new URL(target, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/verify", url.origin));
}
