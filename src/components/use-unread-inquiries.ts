"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export function useUnreadInquiries(ownerId?: string) {
  const [count, setCount] = useState(0);
  const owner = useRef(ownerId);
  const request = useRef(0);
  owner.current = ownerId;
  const refreshUnread = useCallback(async () => {
    const db = getSupabase();
    if (!db || !ownerId) return;
    const current = ++request.current;
    const result = await db
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .is("read_at", null);
    if (
      !result.error &&
      owner.current === ownerId &&
      current === request.current
    )
      setCount(result.count || 0);
  }, [ownerId]);
  useEffect(() => {
    setCount(0);
    const refresh = () => {
      if (document.visibilityState === "visible") void refreshUnread();
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshUnread]);
  return { unreadCount: count, refreshUnread };
}
