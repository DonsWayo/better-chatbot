"use client";

import { applyOpencodeEvent } from "@/lib/opencode/event-mapper";
import type { OpencodeSessionStatus } from "@/types/opencode";
import "@/types/opencode"; // ensure global Window.asafeDesktop augmentation is loaded
import type { UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";

export type OpencodeSessionHook = {
  messages: UIMessage[];
  status: OpencodeSessionStatus;
  sendMessage: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  sessionId: string | null;
  isAvailable: boolean;
};

/**
 * Drive an opencode coding session from the chat UI. Events forwarded from
 * the Electron main process via IPC are mapped onto UIMessage[] using the
 * same part shapes the existing message renderer already handles.
 *
 * The hook is a no-op (isAvailable=false) when running outside the desktop
 * app or when opencode is not enabled (ASAFE_DESKTOP_OPENCODE gate).
 */
export function useOpencodeSession(): OpencodeSessionHook {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<OpencodeSessionStatus>("idle");
  const sessionIdRef = useRef<string | null>(null);

  // Use state so React sees the change after hydration (avoids hydration mismatch
  // when the server renders isAvailable=false and the client sees the Electron bridge).
  const [isAvailable, setIsAvailable] = useState(false);
  const desktopRef = useRef<typeof window.asafeDesktop>(undefined);

  useEffect(() => {
    const d = window.asafeDesktop;
    desktopRef.current = d;
    setIsAvailable(!!d?.opencode?.sessionCreate);
  }, []);

  // Subscribe to events forwarded from the main process.
  useEffect(() => {
    const desktop = desktopRef.current;
    if (!desktop?.onOpencodeEvent) return;

    const unsub = desktop.onOpencodeEvent((event) => {
      const p = event.properties as Record<string, any>;

      // Lifecycle events update hook status only — do not touch messages.
      if (event.type === "session.status") {
        const statusType = (p.status as any)?.type;
        setStatus(statusType === "busy" ? "running" : "idle");
        return;
      }
      if (event.type === "session.idle") {
        setStatus("idle");
        return;
      }
      if (event.type === "session.error") {
        setStatus("error");
        return;
      }

      setMessages((prev) => applyOpencodeEvent(prev, event as any));
    });

    return unsub;
  }, [isAvailable]);

  const sendMessage = useCallback(
    async (text: string) => {
      const oc = desktopRef.current?.opencode;
      if (!oc) return;

      // Lazy session creation.
      if (!sessionIdRef.current) {
        try {
          const session = await oc.sessionCreate();
          sessionIdRef.current = session.id;
        } catch (err) {
          console.error("[opencode] session create failed:", err);
          setStatus("error");
          return;
        }
      }

      // Optimistically add user message to local state.
      const userMsg: UIMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        parts: [{ type: "text", text }],
      } as any;
      setMessages((prev) => [...prev, userMsg]);
      setStatus("running");

      try {
        await oc.prompt(sessionIdRef.current, text);
      } catch (err) {
        console.error("[opencode] prompt failed:", err);
        setStatus("error");
      }
    },
    [],
  );

  const stop = useCallback(async () => {
    const id = sessionIdRef.current;
    const oc = desktopRef.current?.opencode;
    if (!id || !oc?.abort) return;
    await oc.abort(id);
    setStatus("idle");
  }, []);

  return {
    messages,
    status,
    sendMessage,
    stop,
    sessionId: sessionIdRef.current,
    isAvailable,
  };
}
