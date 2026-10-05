/**
 * The brief names Supabase as the Postgres host. PLO talks to Postgres through
 * the generic `@/lib/db` layer (dual-identity pools + RLS request context) so
 * it runs identically against local Postgres, the Supabase pooler, or any
 * Postgres. This module re-exports that layer under the "supabase" name the
 * folder map expects.
 */
export * from "@/lib/db";
