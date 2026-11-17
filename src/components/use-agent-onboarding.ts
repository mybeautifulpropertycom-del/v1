"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { GuideStatus } from "@/lib/agent-onboarding";

export function useAgentOnboarding(
  ownerId: string | undefined,
  isAdmin: boolean,
) {
  const [status, setStatus] = useState<GuideStatus | null>(null);
  const [creationSeenOwner, setCreationSeenOwner] = useState<string | null>(
    null,
  );
  const version = useRef(0);
  const storageKey = ownerId ? `up-guide-creation-seen:${ownerId}` : null;
  const markGuideCreationSeen = useCallback(async () => {
    if (!ownerId || isAdmin || !storageKey) return;
    setCreationSeenOwner(ownerId);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* Account persistence still works without browser storage. */
    }
    const db = getSupabase();
    if (!db) return;
    // The browser fallback also covers older installations and temporary
    // network failures. The next successful load retries the account update.
    await db
      .from("agent_onboarding")
      .update({ creation_seen: true })
      .eq("owner_id", ownerId)
      .eq("status", "active");
  }, [ownerId, isAdmin, storageKey]);
  useEffect(() => {
    setStatus(null);
    setCreationSeenOwner(null);
    const db = getSupabase();
    if (!ownerId || isAdmin || !db) return;
    let active = true;
    async function load() {
      if (document.visibilityState !== "visible") return;
      const request = ++version.current;
      const { data, error } = await db!
        .from("agent_onboarding")
        .select("*")
        .eq("owner_id", ownerId!)
        .maybeSingle();
      if (active && request === version.current && !error) {
        setStatus(data?.status ?? null);
        let localSeen = false;
        try {
          localSeen =
            storageKey !== null && localStorage.getItem(storageKey) === "1";
        } catch {
          /* Account persistence does not require browser storage. */
        }
        if (data?.creation_seen || localSeen) {
          setCreationSeenOwner(ownerId!);
          if (data?.creation_seen) {
            try {
              if (storageKey) localStorage.setItem(storageKey, "1");
            } catch {
              /* Storage is optional. */
            }
          } else if (data?.status === "active") {
            void markGuideCreationSeen();
          }
        }
      }
      // An installation without the migration still has a working workspace.
    }
    void load();
    const refresh = () => {
      void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      version.current++;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [ownerId, isAdmin, storageKey, markGuideCreationSeen]);

  const closeGuide = useCallback(
    async (next: "dismissed" | "completed") => {
      const db = getSupabase();
      if (!db || !ownerId || isAdmin) return;
      ++version.current;
      const { data, error } = await db
        .from("agent_onboarding")
        .update({ status: next })
        .eq("owner_id", ownerId)
        .select("status")
        .single();
      if (error || !data || data.status === "active")
        throw new Error("Ghidul nu a putut fi închis. Încearcă din nou.");
      ++version.current;
      setStatus(data.status);
    },
    [ownerId, isAdmin],
  );
  return {
    guideStatus: isAdmin ? null : status,
    guideCreationSeen:
      !isAdmin && Boolean(ownerId && creationSeenOwner === ownerId),
    markGuideCreationSeen,
    closeGuide,
  };
}
