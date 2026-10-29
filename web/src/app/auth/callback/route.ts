import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { decodeClaims, homeForRole } from "@/lib/claims";

// Magic link (PKCE) callback: exchanges the code for a session cookie.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  if (code) {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
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
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
  }
  return NextResponse.redirect(new URL("/verify", url.origin));
}
