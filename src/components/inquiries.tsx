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
          "Mesajele nu au putut fi încărcate. Reîncarcă pagina și încearcă din nou.",
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
      notify("Mesajul nu a putut fi marcat ca citit. Încearcă din nou.");
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
        "Mesajul nu a putut fi șters. Verifică conexiunea și încearcă din nou.",
      );
    requestVersion.current++;
    setInquiries((current) => current.filter((item) => item.id !== id));
    await refreshUnread();
    notify("Mesajul a fost șters.");
  }
  return (
    <>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">CONVERSAȚIILE BUNE ÎNCEP AICI</span>
          <h1 data-guide-messages>
            Un mesaj nou.
            <br />
            <em>O nouă posibilitate.</em>
          </h1>
          <p>Mesaje primite prin formularele proprietăților.</p>
        </div>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : loading ? (
        <p className="inline-notice">Se încarcă mesajele…</p>
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
                  {!item.read_at && <span className="lead-new-label">Nou</span>}
                  <small>
                    {properties.find((p) => p.id === item.property_id)?.title ||
                      (item.property_id
                        ? "Solicitare despre proprietate"
                        : "Proprietate ștearsă")}
                  </small>
                </div>
                <small>
                  {new Date(item.created_at).toLocaleString("ro-RO", {
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
                    aria-label={`Marchează mesajul de la ${item.name} ca citit`}
                  >
                    <Check size={14} />
                    {marking === item.id
                      ? "Se salvează…"
                      : "Marchează ca citit"}
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
                  <Link href={`/panou/proprietati/${item.property_id}`}>
                    Vezi proprietatea <ArrowUpRight size={14} />
                  </Link>
                )}
                <DeleteAction
                  label={`Șterge mesajul de la ${item.name}`}
                  confirmation={`Ștergi mesajul de la ${item.name}? Datele de contact și mesajul vor fi eliminate definitiv. Acțiunea nu poate fi anulată.`}
                  onDelete={() => deleteInquiry(item.id)}
                />
              </div>
            </article>
          ))}
          <p className="form-intro">
            Sunt afișate cele mai recente 100 de mesaje. Răspunsurile se deschid
            în aplicația de e-mail sau telefon.
          </p>
        </div>
      ) : (
        <div className="empty-state">
          <Inbox size={37} />
          <h3>Niciun mesaj. Deocamdată.</h3>
          <p>
            {demo
              ? "Acestea sunt mesaje demonstrative. După conectarea Supabase, mesajele de pe site-urile publicate vor apărea aici."
              : "Când cineva te contactează printr-un site publicat, mesajul apare aici."}
          </p>
          <Link className="button secondary" href="/panou">
            Înapoi la proprietățile mele <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
    </>
  );
}
