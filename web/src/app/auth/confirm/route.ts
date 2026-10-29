import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { decodeClaims, homeForRole } from "@/lib/claims";

// Email links (team invites and self-serve workspace activation) carry a
// token hash. Verifying it signs the person in with a session cookie; new
// accounts continue to their workspace or /welcome.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
  const type = (url.searchParams.get("type") ?? url.searchParams.get("amp;type") ?? "invite") as EmailOtpType;
  const next = url.searchParams.get("next");

  const supabase = await getSupabaseServer();

  // If the user already has an active session (e.g. link was pre-fetched or already clicked),
  // send them straight to their workspace instead of an expired link screen.
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    const { data: sessionData } = await supabase.auth.getSession();
    const claims = decodeClaims(sessionData.session?.access_token);
    const destination = homeForRole(claims?.app_role);
    const target = next && next.startsWith("/") && next !== "/" ? next : destination === "/no-access" ? "/dashboard" : destination;
    return NextResponse.redirect(new URL(target, url.origin));
  }

  if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      const claims = decodeClaims(data.session?.access_token);
      const destination = homeForRole(claims?.app_role);
      const defaultWorkspace = destination === "/no-access" ? "/dashboard" : destination;
      const target = next && next.startsWith("/") && next !== "/" ? next : defaultWorkspace;

      const response = NextResponse.redirect(new URL(target, url.origin));
      const cookieStore = await cookies();
      cookieStore.getAll().forEach((c) => {
        response.cookies.set(c.name, c.value);
      });
      return response;
    }
    console.error("[auth/confirm] verifyOtp error:", error.message, { type, tokenLength: tokenHash.length });
  }

  return NextResponse.redirect(new URL("/verify", url.origin));
}
