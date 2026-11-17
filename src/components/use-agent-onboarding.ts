"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { GuideStatus } from "@/lib/agent-onboarding";

export function useAgentOnboarding(
  ownerId: string | undefined,
  isAdmin: boolean,
) {
  const [status, setStatus] = useState<GuideStatus | null>(null);
  const version = useRef(0);
  useEffect(() => {
    setStatus(null);
    const db = getSupabase();
    if (!ownerId || isAdmin || !db) return;
    let active = true;
    async function load() {
      if (document.visibilityState !== "visible") return;
      const request = ++version.current;
      const { data, error } = await db!
        .from("agent_onboarding")
        .select("status")
        .eq("owner_id", ownerId!)
        .maybeSingle();
      if (active && request === version.current && !error)
        setStatus(data?.status ?? null);
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
  }, [ownerId, isAdmin]);

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
  return { guideStatus: isAdmin ? null : status, closeGuide };
}
