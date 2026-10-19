"use client";

import dynamic from "next/dynamic";

// The tool works on browser-only state (WebGL viewers, map, localStorage
// draft); it is not rendered on the server.
export const OfficeToolLoader = dynamic(() => import("./office-tool").then((m) => m.OfficeTool), {
  ssr: false,
});
