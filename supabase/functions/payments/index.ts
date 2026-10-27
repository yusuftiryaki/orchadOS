// payments: placeholder until IP12-B's function lands (PR #54). The Supabase CLI
// refuses to start when a function in config.toml has no index.ts, and
// config.toml (owned by IP12-A1) keeps the entry enabled so the function
// is served as soon as B's code is merged.
//
// Merge note: when this file conflicts with IP12-B's payments/index.ts
// (add/add), take B's version and drop this placeholder.
//
// Every request: 501 {"error": "not_implemented"}.

Deno.serve(() =>
  new Response(JSON.stringify({ error: "not_implemented" }), {
    status: 501,
    headers: { "content-type": "application/json; charset=utf-8" },
  })
);
