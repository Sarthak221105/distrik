import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { decodeClaims, homeForRole, type AppRole } from "@/lib/claims";

// Refreshes the Supabase session cookie and routes each user to their
// surface. This is a convenience: RLS and RPC role checks are the real
// enforcement.
const PUBLIC_PATHS = ["/login", "/verify", "/auth", "/no-access", "/offline", "/manifest.webmanifest", "/sw.js"];

const SURFACES: { prefix: string; roles: AppRole[] }[] = [
  { prefix: "/system", roles: ["system_admin"] },
  { prefix: "/rep", roles: ["rep", "owner", "sales_head"] },
  {
    prefix: "/",
    roles: ["owner", "sales_head"],
  },
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: userData } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!userData.user) {
    if (isPublic) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const claims = decodeClaims(sessionData.session?.access_token);
  const role = claims?.app_role;

  if (path === "/" || path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = homeForRole(role);
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (isPublic) return response;

  const surface = SURFACES.find((s) => (s.prefix === "/" ? true : path === s.prefix || path.startsWith(s.prefix + "/")));
  if (surface && (!role || !surface.roles.includes(role))) {
    const url = request.nextUrl.clone();
    url.pathname = homeForRole(role);
    url.search = "";
    if (url.pathname === path) return response;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|maplibre/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
