"use client";

import { initNativeBridge } from "lib/native/capacitor";
import { useEffect } from "react";

/**
 * Mount-once client boundary for the Capacitor native bridge (mobile/).
 * Renders nothing; on web it is a guaranteed no-op (see
 * src/lib/native/capacitor.ts). Mounted in the root layout so the splash
 * screen also hides on unauthenticated routes like /sign-in.
 */
export function CapacitorBridge() {
  useEffect(() => {
    void initNativeBridge();
  }, []);
  return null;
}
