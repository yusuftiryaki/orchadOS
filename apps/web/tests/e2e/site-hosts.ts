// The extra servers of playwright.config.ts, on the same production build as
// the main one (127.0.0.1:3100: sign-up open, /demo served). Flags are read
// per request, so each `next start` shows another deployment:
// - CLOSED_SITE: a main site with sign-up closed that links to the demo host
//   (the pilot before its sign-up opens: ORCHADOS_DEMO_URL, no
//   ORCHADOS_SIGNUP_ENABLED);
// - DEMO_HOST: a demo deployment (ORCHADOS_MAIN_SITE_URL = CLOSED_SITE),
//   like orchados-demo. On `localhost`, not 127.0.0.1: cookies ignore the
//   port, and the demo session must not reach the other servers.
export const CLOSED_SITE = "http://127.0.0.1:3101";
export const DEMO_HOST = "http://localhost:3102";
