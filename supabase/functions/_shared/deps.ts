// Pinned third party dependencies, imported once so every function uses the
// same versions. npm: specifiers work in the Supabase Edge Runtime (Deno 2).
export { createClient } from "npm:@supabase/supabase-js@2.118.0";
export type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
