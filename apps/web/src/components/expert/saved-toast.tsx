"use client";

import { useCallback, useState } from "react";
import { Toast } from "@/components/ui/toast";

// "Karar kaydedildi." after a decision. The page keys it by the decision, so
// every save shows it again.
export function SavedToast({ message }: { message: string }) {
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Toast open={open} onClose={close}>
      {message}
    </Toast>
  );
}
