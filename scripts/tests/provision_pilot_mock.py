"""Mock Supabase Management API and Vercel API for scripts/test-provision-pilot.sh.

The pilot project (Edge secrets, Auth config, Vault, the rows the read query
of scripts/provision-pilot-signup.sh counts) and the Vercel project
orchados-pilot, with state across requests. The test project exists too and
refuses every call: the pilot script never touches it. Control endpoints under
/__ctl/ reset and tweak state and return it. Stdlib only.

Usage: python3 provision_pilot_mock.py PORT_FILE
"""

import hashlib
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

SB_TOKEN = "sb-token-SECRET"
VC_TOKEN = "vc-token-SECRET"
PILOT_REF = "pilotref00000000000"
TEST_REF = "testref000000000000"
ORG = "b0000000-0000-4000-8000-000000000001"
HOOK = "v1,whsec_aG9vay1TRUNSRVQtdmFsdWUtMDEyMzQ1Njc4OWFi"


def fresh_state():
    return {
        "projects": {
            PILOT_REF: {"id": PILOT_REF, "name": "orchados-pilot", "status": "ACTIVE_HEALTHY"},
            TEST_REF: {"id": TEST_REF, "name": "orchados", "status": "ACTIVE_HEALTHY"},
        },
        # The pilot as it is before sign-ups open: record provider, the SMS
        # hook set up for staff phone login, no sign-up secrets.
        "secrets": {"MESSAGE_PROVIDER": "record", "PORTAL_BASE_URL": "https://old.example",
                    "SEND_SMS_HOOK_SECRET": HOOK},
        "auth": {"site_url": "https://orchados-pilot.vercel.app", "disable_signup": True,
                 "sms_autoconfirm": False, "external_phone_enabled": True,
                 "hook_send_sms_enabled": True,
                 "hook_send_sms_uri": f"https://{PILOT_REF}.supabase.co/functions/v1/send-sms",
                 "hook_send_sms_secrets": HOOK, "rate_limit_sms_sent": 30,
                 "smtp_pass": "smtp-SECRET"},
        "vault": {},
        "db": {"billing_table": 1, "send_code": 1, "signup_cleanup_jobs": 1,
               "orgs": [ORG], "signup_org": "", "fake_orgs": 0},
        "vercel": {"id": "prj_pilot", "name": "orchados-pilot",
                   "link": {"type": "github", "org": "yusuftiryaki", "repo": "orchadOS",
                            "productionBranch": "release"},
                   "ssoProtection": {"deploymentType": "preview"}},
        "vercel_env": [
            {"id": "env1", "key": "NEXT_PUBLIC_SUPABASE_URL", "type": "encrypted", "target": ["production"],
             "value": f"https://{PILOT_REF}.supabase.co"},
            {"id": "env2", "key": "NEXT_PUBLIC_SUPABASE_ANON_KEY", "type": "encrypted", "target": ["production"],
             "value": "pilot-anon-public-key"},
            {"id": "env3", "key": "ORCHADOS_SITE_URL", "type": "encrypted", "target": ["production"],
             "value": "https://orchados-pilot.vercel.app"},
            {"id": "env4", "key": "ORCHADOS_DEMO_URL", "type": "encrypted", "target": ["production"],
             "value": "https://orchados-demo.vercel.app/demo"},
        ],
        "env_seq": 10,
        "deployments": [],
        "log": [],
    }


STATE = fresh_state()
# Every SQL text sent to /database/query, kept across resets (scripts/test-script-sql.sh).
QUERIES = []


def digest(v):
    return hashlib.sha256(v.encode()).hexdigest()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, body=None):
        data = b"" if body is None else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        return json.loads(raw) if raw else None

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PATCH(self):
        self.route("PATCH")

    def do_DELETE(self):
        self.route("DELETE")

    def route(self, method):
        url = urlparse(self.path)
        path, query = url.path, parse_qs(url.query)
        body = self.body()
        if path.startswith("/__ctl/"):
            return self.ctl(path[7:], body)
        STATE["log"].append({"method": method, "path": path, "query": url.query, "body": body})
        auth = self.headers.get("Authorization", "")
        if path.startswith("/sb/"):
            if auth != f"Bearer {SB_TOKEN}":
                return self.reply(401, {"message": "bad token"})
            return self.supabase(method, path[3:], body)
        if path.startswith("/vc/"):
            if auth != f"Bearer {VC_TOKEN}":
                return self.reply(403, {"error": {"message": "bad token"}})
            if query.get("teamId") != ["team_test"]:
                return self.reply(400, {"error": {"message": "teamId missing"}})
            return self.vercel(method, path[3:], query, body)
        self.reply(404, {"message": "no route"})

    def ctl(self, op, body):
        global STATE
        if op == "reset":
            STATE = fresh_state()
        elif op == "clear-log":
            STATE["log"] = []
        elif op == "queries":
            return self.reply(200, QUERIES)
        elif op == "patch":
            # {"secrets": {...}, "auth": {...}, "db": {...}, "vault": {...}}: merged; null drops a key.
            for part, values in body.items():
                for k, v in values.items():
                    if v is None:
                        STATE[part].pop(k, None)
                    else:
                        STATE[part][k] = v
        elif op == "add-vercel-env":
            STATE["env_seq"] += 1
            STATE["vercel_env"].append({"id": f"env{STATE['env_seq']}", "type": "encrypted",
                                        "target": ["production"], **body})
        elif op == "drop-vercel-env":
            STATE["vercel_env"] = [e for e in STATE["vercel_env"] if e["key"] != body["key"]]
        return self.reply(200, STATE)

    # --- Supabase -------------------------------------------------------------
    def supabase(self, method, path, body):
        m = re.fullmatch(r"/v1/projects/([a-z0-9]+)(/.*)?", path)
        if not m or m.group(1) not in STATE["projects"]:
            return self.reply(404, {"message": "not found"})
        ref, rest = m.group(1), m.group(2) or ""
        if ref != PILOT_REF:
            return self.reply(403, {"message": "only the pilot is provisioned"})
        if rest == "" and method == "GET":
            return self.reply(200, STATE["projects"][ref])
        if rest == "/config/auth" and method == "GET":
            return self.reply(200, STATE["auth"])
        if rest == "/config/auth" and method == "PATCH":
            STATE["auth"].update(body)
            return self.reply(200, STATE["auth"])
        if rest == "/secrets" and method == "GET":
            return self.reply(200, [{"name": k, "value": digest(v)} for k, v in STATE["secrets"].items()])
        if rest == "/secrets" and method == "POST":
            for s in body:
                if not s.get("value"):
                    return self.reply(400, {"message": f"empty value for {s.get('name')}"})
                STATE["secrets"][s["name"]] = s["value"]
            return self.reply(201)
        if rest == "/secrets" and method == "DELETE":
            if not isinstance(body, list) or not all(isinstance(n, str) for n in body):
                return self.reply(400, {"message": "expected a list of names"})
            for n in body:
                STATE["secrets"].pop(n, None)
            return self.reply(200)
        if rest == "/database/query" and method == "POST":
            return self.sql(body["query"])
        return self.reply(404, {"message": "no route"})

    def sql(self, q):
        if q not in QUERIES:
            QUERIES.append(q)
        db, vault = STATE["db"], STATE["vault"]
        if "as billing_table" in q:
            want = dict(re.findall(r"name = ''(signup_cleanup_url|contract_documents_sweep_url)''\s+and decrypted_secret = ''([^']*)''", q))
            org_given = re.search(r"from public\.org where id = ''([^']*)''", q).group(1)
            cron = vault.get("orchados_cron_secret", "")
            return self.reply(201, [{
                "billing_table": db["billing_table"], "send_code": db["send_code"],
                "signup_cleanup_jobs": db["signup_cleanup_jobs"], "orgs": len(db["orgs"]),
                "only_org": db["orgs"][0] if len(db["orgs"]) == 1 else "",
                "org_given": int(org_given in db["orgs"]), "signup_org": db["signup_org"],
                "fake_orgs": db["fake_orgs"],
                "cleanup_url_ok": int(vault.get("signup_cleanup_url") == want.get("signup_cleanup_url")),
                "sweep_url_ok": int(vault.get("contract_documents_sweep_url") == want.get("contract_documents_sweep_url")),
                "cron_secret_digest": digest(cron) if cron else "",
            }])
        m = re.search(r"insert into public\.org_billing_setting \(org_id, accepts_signups\) values \('([^']*)', true\)", q)
        if m:
            if m.group(1) not in db["orgs"]:
                return self.reply(400, {"message": "violates foreign key"})
            db["signup_org"] = m.group(1)
            return self.reply(201, [])
        if q.startswith("update public.org_billing_setting set accepts_signups = false where accepts_signups"):
            db["signup_org"] = ""
            return self.reply(201, [])
        ups = re.findall(r"perform vault\.create_secret\('([^']*)', '([^']*)'\);", q)
        if ups and q.count("do $$ begin") == len(ups):
            for value, name in ups:
                vault[name] = value
            return self.reply(201, [])
        return self.reply(400, {"message": "unexpected query"})

    # --- Vercel ---------------------------------------------------------------
    def vercel(self, method, path, query, body):
        proj = STATE["vercel"]
        if path == "/v9/projects/prj_pilot" and method == "GET":
            return self.reply(200, proj)
        if path == "/v9/projects/prj_pilot/env" and method == "GET":
            return self.reply(200, {"envs": [{k: v for k, v in e.items() if k != "value"}
                                             for e in STATE["vercel_env"]]})
        m = re.fullmatch(r"/v1/projects/prj_pilot/env/(\w+)", path)
        if m and method == "GET":
            e = next((e for e in STATE["vercel_env"] if e["id"] == m.group(1)), None)
            if not e:
                return self.reply(404, {"error": {"code": "not_found"}})
            out = dict(e)
            if e["type"] == "sensitive":
                out.pop("value", None)
            return self.reply(200, out)
        m = re.fullmatch(r"/v9/projects/prj_pilot/env/(\w+)", path)
        if m and method == "DELETE":
            STATE["vercel_env"] = [e for e in STATE["vercel_env"] if e["id"] != m.group(1)]
            return self.reply(200, {})
        if path == "/v10/projects/prj_pilot/env" and method == "POST":
            if query.get("upsert") != ["true"] or body.get("target") != ["production"]:
                return self.reply(400, {"error": {"message": "upsert/target"}})
            STATE["vercel_env"] = [e for e in STATE["vercel_env"]
                                   if not (e["key"] == body["key"] and "production" in e["target"])]
            STATE["env_seq"] += 1
            STATE["vercel_env"].append({"id": f"env{STATE['env_seq']}", **body})
            return self.reply(201, {"created": {"key": body["key"]}})
        if path == "/v13/deployments" and method == "POST":
            d = {"id": f"dpl_{len(STATE['deployments']) + 1}", "state": "QUEUED",
                 "inspectorUrl": "https://vercel.com/orchad-os/orchados-pilot/x", "request": body}
            STATE["deployments"].append(d)
            return self.reply(200, d)
        return self.reply(404, {"error": {"message": "no route"}})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    with open(sys.argv[1], "w") as f:
        f.write(str(server.server_address[1]))
    server.serve_forever()


if __name__ == "__main__":
    main()
