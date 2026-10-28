"""Mock Supabase Management API and Vercel API for scripts/test-provision-demo.sh.

Keeps state across requests so a second run of scripts/provision-demo.sh sees
what the first one created. Control endpoints under /__ctl/ let the test reset
state, read the request log and tweak state. Stdlib only.

Usage: python3 provision_demo_mock.py PORT_FILE
"""

import hashlib
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

SB_TOKEN = "sb-token-SECRET"
VC_TOKEN = "vc-token-SECRET"
TEST_REF = "testref000000000000"
DEMO_REF = "demoref000000000000"
ORG = "org-test"
SERVICE_ROLE = "service-role-SECRET-key"
ANON = "anon-public-key"


def fresh_state():
    return {
        "projects": {
            TEST_REF: {"id": TEST_REF, "name": "orchados", "organization_id": ORG,
                       "region": "eu-north-1", "status": "ACTIVE_HEALTHY"},
            # Same name in another organization: must be ignored.
            "otherorg00000000000": {"id": "otherorg00000000000", "name": "orchados-demo",
                                    "organization_id": "org-other", "region": "us-east-1",
                                    "status": "ACTIVE_HEALTHY"},
        },
        "orgs": [ORG],
        "db_pass": None,
        "coming_up_polls": 2,
        "auth": {"site_url": "http://localhost:3000", "disable_signup": False,
                 "mailer_autoconfirm": True, "sms_autoconfirm": True},
        "secrets": {},
        "vault": {},
        "vercel": None,
        "vercel_env": [],
        "deployments": [],
        "env_seq": 0,
        "log": [],
    }


STATE = fresh_state()


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
        elif op == "drop-vercel-env":
            STATE["vercel_env"] = [e for e in STATE["vercel_env"] if e["key"] != body["key"]]
        elif op == "add-vercel-env":
            STATE["env_seq"] += 1
            STATE["vercel_env"].append({"id": f"env{STATE['env_seq']}", "type": "encrypted",
                                        "target": body.get("target", ["production"]), **body})
        elif op == "set-status":
            STATE["projects"][body["ref"]]["status"] = body["status"]
        elif op == "add-org":
            STATE["orgs"].append(body["id"])
        elif op == "drop-secret":
            STATE["secrets"].pop(body["name"], None)
        return self.reply(200, STATE)

    # --- Supabase -------------------------------------------------------------
    def supabase(self, method, path, body):
        projects = STATE["projects"]
        if path == "/v1/organizations" and method == "GET":
            return self.reply(200, [{"id": o, "name": o} for o in STATE["orgs"]])
        if path == "/v1/projects" and method == "GET":
            return self.reply(200, list(projects.values()))
        if path == "/v1/projects" and method == "POST":
            if set(body) != {"name", "organization_id", "region", "db_pass"}:
                return self.reply(400, {"message": f"unexpected fields {sorted(body)}"})
            projects[DEMO_REF] = {"id": DEMO_REF, "name": body["name"],
                                  "organization_id": body["organization_id"],
                                  "region": body["region"], "status": "COMING_UP"}
            STATE["db_pass"] = body["db_pass"]
            return self.reply(201, projects[DEMO_REF])
        m = re.fullmatch(r"/v1/projects/([a-z0-9]+)(/.*)?", path)
        if not m or m.group(1) not in projects:
            return self.reply(404, {"message": "not found"})
        ref, rest = m.group(1), m.group(2) or ""
        p = projects[ref]
        if rest == "" and method == "GET":
            if p["status"] == "COMING_UP":
                STATE["coming_up_polls"] -= 1
                if STATE["coming_up_polls"] < 0:
                    p["status"] = "ACTIVE_HEALTHY"
            return self.reply(200, p)
        if ref != DEMO_REF:
            return self.reply(403, {"message": "only the demo project may be changed"})
        if p["status"] != "ACTIVE_HEALTHY":
            return self.reply(503, {"message": "project not ready"})
        if rest == "/api-keys":
            return self.reply(200, [{"name": "anon", "api_key": ANON, "type": "legacy"},
                                    {"name": "service_role", "api_key": SERVICE_ROLE, "type": "legacy"}])
        if rest == "/config/auth" and method == "GET":
            return self.reply(200, STATE["auth"])
        if rest == "/config/auth" and method == "PATCH":
            STATE["auth"].update(body)
            return self.reply(200, STATE["auth"])
        if rest == "/secrets" and method == "GET":
            return self.reply(200, [{"name": k, "value": hashlib.sha256(v.encode()).hexdigest()}
                                    for k, v in STATE["secrets"].items()])
        if rest == "/secrets" and method == "POST":
            for s in body:
                if not s.get("value"):
                    return self.reply(400, {"message": f"empty value for {s.get('name')}"})
                STATE["secrets"][s["name"]] = s["value"]
            return self.reply(201)
        if rest == "/database/query" and method == "POST":
            q = body["query"]
            if q.startswith("select name from vault.secrets"):
                return self.reply(200, [{"name": n} for n in STATE["vault"]])
            ups = re.findall(r"perform vault\.create_secret\('([^']*)', '([^']*)'\)", q)
            if not ups:
                return self.reply(400, {"message": "unexpected query"})
            for value, name in ups:
                STATE["vault"][name] = value
            return self.reply(201, [])
        return self.reply(404, {"message": "no route"})

    # --- Vercel ---------------------------------------------------------------
    def vercel(self, method, path, query, body):
        proj = STATE["vercel"]
        if path == "/v9/projects/orchados-demo" and method == "GET":
            return self.reply(200, proj) if proj else self.reply(404, {"error": {"code": "not_found"}})
        if path == "/v10/projects" and method == "POST":
            if proj:
                return self.reply(409, {"error": {"message": "exists"}})
            STATE["vercel"] = {
                "id": "prj_demo", "name": body["name"], "framework": body["framework"],
                "rootDirectory": body["rootDirectory"],
                "commandForIgnoringBuildStep": body.get("commandForIgnoringBuildStep"),
                "serverlessFunctionRegion": "iad1",
                "ssoProtection": {"deploymentType": "all_except_custom_domains"},
                "link": {"type": "github", "org": body["gitRepository"]["repo"].split("/")[0],
                         "repo": body["gitRepository"]["repo"].split("/")[1],
                         "productionBranch": "main"},
            }
            return self.reply(200, STATE["vercel"])
        if not proj:
            return self.reply(404, {"error": {"code": "not_found"}})
        if path == "/v9/projects/prj_demo" and method == "GET":
            return self.reply(200, proj)
        if path == "/v9/projects/prj_demo" and method == "PATCH":
            proj.update(body)
            return self.reply(200, proj)
        if path == "/v9/projects/prj_demo/env" and method == "GET":
            return self.reply(200, {"envs": [{k: v for k, v in e.items() if k != "value"}
                                             for e in STATE["vercel_env"]]})
        m = re.fullmatch(r"/v1/projects/prj_demo/env/(\w+)", path)
        if m and method == "GET":
            e = next((e for e in STATE["vercel_env"] if e["id"] == m.group(1)), None)
            if not e:
                return self.reply(404, {"error": {"code": "not_found"}})
            out = dict(e)
            if e["type"] == "sensitive":
                out.pop("value", None)
            return self.reply(200, out)
        if path == "/v10/projects/prj_demo/env" and method == "POST":
            if query.get("upsert") != ["true"] or body.get("target") != ["production"]:
                return self.reply(400, {"error": {"message": "upsert/target"}})
            STATE["vercel_env"] = [e for e in STATE["vercel_env"]
                                   if not (e["key"] == body["key"] and "production" in e["target"])]
            STATE["env_seq"] += 1
            STATE["vercel_env"].append({"id": f"env{STATE['env_seq']}", **body})
            return self.reply(201, {"created": {"key": body["key"]}})
        if path == "/v6/deployments" and method == "GET":
            return self.reply(200, {"deployments": STATE["deployments"][-1:]})
        if path == "/v13/deployments" and method == "POST":
            d = {"id": f"dpl_{len(STATE['deployments']) + 1}", "state": "READY",
                 "inspectorUrl": "https://vercel.com/orchad-os/orchados-demo/x", "request": body}
            STATE["deployments"].append(d)
            return self.reply(200, d)
        if path == "/v9/projects/prj_demo/domains" and method == "GET":
            return self.reply(200, {"domains": [{"name": "orchados-demo.vercel.app"}]})
        return self.reply(404, {"error": {"message": "no route"}})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    with open(sys.argv[1], "w") as f:
        f.write(str(server.server_address[1]))
    server.serve_forever()


if __name__ == "__main__":
    main()
