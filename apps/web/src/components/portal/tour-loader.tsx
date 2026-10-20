"use client";

import dynamic from "next/dynamic";

// The tour runs on browser-only state (WebGL viewer, map, canvas placeholder);
// it is not rendered on the server.
export const TourLoader = dynamic(() => import("./tour").then((m) => m.Tour), { ssr: false });
