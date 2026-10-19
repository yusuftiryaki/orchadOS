import type { TestProject } from "vitest/node";
import { resolveSupabaseEnv, type SupabaseTestEnv } from "../local-supabase";

declare module "vitest" {
  export interface ProvidedContext {
    supabase: SupabaseTestEnv;
  }
}

export default function setup(project: TestProject) {
  project.provide("supabase", resolveSupabaseEnv());
}
