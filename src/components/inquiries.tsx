"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Inbox, Mail, Phone } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { safePhone } from "@/lib/model";
import { useWorkspace } from "./workspace-provider";
type Inquiry = {
  id: string;
  property_id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
};
export function Inquiries() {
  const { demo, profile, properties } = useWorkspace();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const supabase = getSupabase();
    if (supabase)
      void supabase
        .from("inquiries")
        .select("id,property_id,name,email,phone,message,created_at")
        .eq("owner_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(100)
        .then(({ data, error }) => {
          if (!active) return;
          if (error)
            setError(
              "Your inbox could not be loaded. Please refresh and try again.",
            );
          else setInquiries(data as Inquiry[]);
          setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [profile.id]);
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
            <article className="inquiry-card" key={item.id}>
              <div className="inquiry-card-head">
                <div>
                  <h3>{item.name}</h3>
                  <small>
                    {properties.find((p) => p.id === item.property_id)?.title ||
                      "Property inquiry"}
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
                <Link href={`/dashboard/properties/${item.property_id}`}>
                  View property <ArrowUpRight size={14} />
                </Link>
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
