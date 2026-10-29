"use client";

import { useId, useState } from "react";
import { bulkApproveAction } from "@/app/uzman/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { t } from "@/lib/i18n";
import styles from "./expert.module.css";

// The bulk approval button: approving many trees at once is hard to undo, so
// a dialog states how many trees it approves before the form is sent.
export function BulkConfirm({
  sessionId,
  returnPath,
  eligible,
  sample,
}: {
  sessionId: string;
  returnPath: string;
  eligible: number;
  // Trees of the quality sample; they stay out of the bulk approval.
  sample: number;
}) {
  const b = t.expert.bulk;
  const [open, setOpen] = useState(false);
  const formId = useId();
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {b.button(eligible)}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={b.confirmTitle}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {b.cancel}
            </Button>
            <Button type="submit" form={formId}>
              {b.confirmButton(eligible)}
            </Button>
          </>
        }
      >
        <form id={formId} action={bulkApproveAction} className={styles.dialogText}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="return" value={returnPath} />
          <input type="hidden" name="expected" value={eligible} />
          <p>{b.confirmBody(eligible)}</p>
          <p>{b.sampleExcluded(sample)}</p>
          <p>{b.confirmUndo}</p>
        </form>
      </Dialog>
    </>
  );
}
