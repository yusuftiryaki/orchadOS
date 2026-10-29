"use client";

import dynamic from "next/dynamic";
import { t } from "@/lib/i18n";
import chrome from "@/components/panorama/panorama.module.css";
import styles from "./portal.module.css";

// The tour runs on browser-only state (WebGL viewer, map, canvas placeholder);
// it is not rendered on the server. Until its code arrives, a box of the
// viewer's size says it is loading (no jump when the tour appears).
export const TourLoader = dynamic(() => import("./tour").then((m) => m.Tour), {
  ssr: false,
  loading: () => (
    <div className={styles.tour}>
      <div className={chrome.wrap}>
        <div className={styles.viewer} aria-busy="true" />
        <p className={chrome.status} role="status">
          {t.panorama.loading}
        </p>
      </div>
    </div>
  ),
});
