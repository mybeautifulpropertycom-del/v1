"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Inbox, Mail, Phone } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { safePhone } from "@/lib/model";
import { DeleteAction } from "./delete-action";
import { useWorkspace } from "./workspace-provider";
type Inquiry = {
  id: string;
  property_id: string | null;
  name: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
  read_at: string | null;
};
export function Inquiries() {
  const { demo, profile, properties, notify, refreshUnread } = useWorkspace();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState<string | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    let active = true;
    const supabase = getSupabase();
    async function load() {
      if (!supabase || document.visibilityState !== "visible") return;
      const version = ++requestVersion.current;
      const { data, error } = await supabase
        .from("inquiries")
        .select("id,property_id,name,email,phone,message,created_at,read_at")
        .eq("owner_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!active || version !== requestVersion.current) return;
      if (error)
        setError(
          "Your inbox could not be loaded. Please refresh and try again.",
        );
      else {
        setInquiries(data as Inquiry[]);
        setError("");
      }
      setLoading(false);
    }
    const refresh = () => {
      void load();
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [profile.id]);
  async function markRead(id: string) {
    const db = getSupabase();
    if (!db || marking) return;
    setMarking(id);
    try {
      const { error } = await db.rpc("mark_inquiries_read", {
        inquiry_ids: [id],
      });
      if (error) throw error;
      requestVersion.current++;
      setInquiries((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
      await refreshUnread();
    } catch {
      notify("This lead could not be marked as read. Please try again.");
    } finally {
      setMarking(null);
    }
  }
  async function deleteInquiry(id: string) {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("inquiries")
      .delete()
      .eq("id", id)
      .eq("owner_id", profile.id)
      .select("id")
      .single();
    if (error || !data)
      throw new Error(
        "This lead could not be deleted. Please check your connection and try again.",
      );
    requestVersion.current++;
    setInquiries((current) => current.filter((item) => item.id !== id));
    await refreshUnread();
    notify("Lead deleted.");
  }
  return (
    <>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">GOOD CONVERSATIONS START HERE</span>
          <h1>
            A new hello.
            <br />
            <em>A new possibility.</em>
          </h1>
          <p>Messages from your property websites, in one personal space.</p>
        </div>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : loading ? (
        <p className="inline-notice">Opening your inbox…</p>
      ) : inquiries.length ? (
        <div className="inquiries-list">
          {inquiries.map((item) => (
            <article
              className={`inquiry-card${!item.read_at ? " inquiry-unread" : ""}`}
              key={item.id}
            >
              <div className="inquiry-card-head">
                <div>
                  <h3>{item.name}</h3>
                  {!item.read_at && <span className="lead-new-label">New</span>}
                  <small>
                    {properties.find((p) => p.id === item.property_id)?.title ||
                      (item.property_id
                        ? "Property inquiry"
                        : "Deleted property")}
                  </small>
                </div>
                <small>
                  {new Date(item.created_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </small>
              </div>
              <p>{item.message}</p>
              <div className="inquiry-card-links">
                {!item.read_at && (
                  <button
                    type="button"
                    className="lead-mark-read"
                    disabled={marking !== null}
                    onClick={() => void markRead(item.id)}
                    aria-label={`Mark lead from ${item.name} as read`}
                  >
                    <Check size={14} />
                    {marking === item.id ? "Saving…" : "Mark as read"}
                  </button>
                )}
                <a href={`mailto:${item.email}`}>
                  <Mail size={14} />
                  {item.email}
                </a>
                {item.phone && (
                  <a href={`tel:${safePhone(item.phone)}`}>
                    <Phone size={14} />
                    {item.phone}
                  </a>
                )}
                {item.property_id && (
                  <Link href={`/dashboard/properties/${item.property_id}`}>
                    View property <ArrowUpRight size={14} />
                  </Link>
                )}
                <DeleteAction
                  label={`Delete lead from ${item.name}`}
                  confirmation={`Delete the lead from ${item.name}? Their contact details and message will be permanently removed from your inbox. This cannot be undone.`}
                  onDelete={() => deleteInquiry(item.id)}
                />
              </div>
            </article>
          ))}
          <p className="form-intro">
            Showing your 100 most recent messages. Replies open in your email or
            phone app.
          </p>
        </div>
      ) : (
        <div className="empty-state">
          <Inbox size={37} />
          <h3>A little quiet. For now.</h3>
          <p>
            {demo
              ? "This is a demo inbox. Once Supabase is connected, messages from your published property websites will appear here."
              : "When someone reaches out through a published website, their message will arrive here."}
          </p>
          <Link className="button secondary" href="/dashboard">
            Back to my properties <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
    </>
  );
}
