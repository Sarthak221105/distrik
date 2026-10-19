export type AppRole = "owner" | "sales_head" | "rep" | "system_admin";

export type Claims = {
  sub: string;
  app_role?: AppRole;
  manufacturer_id?: string;
  email?: string;
  phone?: string;
};

// Decodes the JWT payload (no verification: Supabase verifies it on every
// request, this only routes the user to the right surface).
export function decodeClaims(accessToken: string | undefined | null): Claims | null {
  if (!accessToken) return null;
  const part = accessToken.split(".")[1];
  if (!part) return null;
  try {
    const json =
      typeof atob === "function"
        ? decodeURIComponent(
            atob(part.replace(/-/g, "+").replace(/_/g, "/"))
              .split("")
              .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
              .join(""),
          )
        : Buffer.from(part, "base64url").toString("utf8");
    return JSON.parse(json) as Claims;
  } catch {
    return null;
  }
}

export function homeForRole(role: AppRole | undefined): string {
  switch (role) {
    case "owner":
    case "sales_head":
      return "/dashboard";
    case "rep":
      return "/rep/today";
    case "system_admin":
      return "/system/health";
    default:
      return "/no-access";
  }
}

export const MANUFACTURER_ROLES: AppRole[] = ["owner", "sales_head"];
