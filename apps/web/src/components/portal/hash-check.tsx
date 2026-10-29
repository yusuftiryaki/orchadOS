"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { checkHash, type HashCheck as Result } from "@/lib/portal/evidence";

// "Bütünlüğü doğrula": downloads the photo in the browser and compares its
// SHA-256 with the hash stored when the file was uploaded (content-addressed
// media, CLAUDE.md "Medya değiştirilemez").

const e = t.portal.tree.evidence;

export function HashCheck({ url, hash }: { url: string; hash: string }) {
  const [state, setState] = useState<Result | "checking" | null>(null);
  return (
    <span data-testid="hash-check" data-state={state ?? "idle"}>
      {state === null ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            setState("checking");
            setState(await checkHash(url, hash));
          }}
        >
          {e.verify}
        </Button>
      ) : (
        <span role="status">{state === "checking" ? e.checking : e[state]}</span>
      )}
    </span>
  );
}
