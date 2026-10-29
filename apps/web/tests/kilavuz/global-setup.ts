import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// The office tool's synthetic panoramas and development parcel
// (scripts/office-dev-data.mjs; reused when they exist). The office tool spec
// clears a saved inventory of that parcel itself.
export default function globalSetup() {
  execFileSync("node", [resolve(import.meta.dirname, "../../scripts/office-dev-data.mjs")], {
    stdio: "inherit",
  });
}
