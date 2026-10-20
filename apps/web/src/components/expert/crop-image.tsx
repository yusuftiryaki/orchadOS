"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import styles from "./expert.module.css";

// A crop from a signed URL. The file may be missing from storage (demo data,
// upload not done yet): then, or when no URL could be signed, a placeholder.
export function CropImage({ url, alt }: { url: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div
        className={styles.placeholder}
        role="img"
        aria-label={alt}
        data-testid="crop-placeholder"
      >
        {t.expert.review.imageMissing}
      </div>
    );
  }
  return (
    // Signed storage URLs: next/image would need the storage host configured.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />
  );
}
