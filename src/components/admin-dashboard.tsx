"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWorkspace } from "./workspace-provider";
import { adminRequest } from "@/lib/admin-client";
import { DeleteAction } from "./delete-action";

type Account = {
  id: string;
  name: string;
  login_email: string;
  contact_email: string;
  phone: string;
  agency: string;
  property_count: number;
  last_sign_in_at: string | null;
  deleting?: boolean;
};
type Listing = {
  id: string;
  title: string;
  location: string;
  status: string;
  slug: string;
  agent?: { name: string; email: string };
};
export function AdminDashboard() {
  const { isAdmin, profile, notify } = useWorkspace();
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<"accounts" | "properties">("accounts");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [properties, setProperties] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), search });
      if (view === "properties" && owner) params.set("owner", owner.id);
      void adminRequest(`${view}?${params}`)
        .then((data) => {
          if (!active) return;
          setAccounts(data.accounts || []);
          setProperties(data.properties || []);
          setTotal(data.total);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isAdmin, view, owner, page, search, revision]);
  async function remove(kind: "account" | "property", id: string) {
    await adminRequest("delete", { kind, id });
    notify(
      kind === "account"
        ? "Ștergerea contului a fost solicitată. Proprietățile au fost eliminate; fișierele și contul vor fi șterse în fundal."
        : "Proprietatea a fost ștearsă. Fotografiile și filmul sunt programate pentru eliminare.",
    );
    setPage(0);
    setRevision((value) => value + 1);
  }
  if (!isAdmin)
    return (
      <div className="state-screen">
        <h1>Este necesar accesul de administrator.</h1>
        <Link href="/panou">Înapoi la spațiul de lucru</Link>
      </div>
    );
  function changeView(next: "accounts" | "properties") {
    setView(next);
    setOwner(null);
    setSearch("");
    setPage(0);
  }
  return (
    <section className="admin-console">
      <header>
        <span className="eyebrow">PLATFORMA TA</span>
        <h1>Toate proprietățile, într-un singur loc.</h1>
        <p>
          Verifică conturile agenților și publică gratuit proprietățile
          selectate, inclusiv filmul de prezentare.
        </p>
      </header>
      <div className="admin-controls">
        <div className="admin-tabs" aria-label="Secțiuni de administrare">
          <button
            className="button secondary"
            aria-pressed={view === "accounts"}
            onClick={() => changeView("accounts")}
          >
            Conturi de agenți
          </button>
          <button
            className="button secondary"
            aria-pressed={view === "properties"}
            onClick={() => changeView("properties")}
          >
            Toate proprietățile
          </button>
        </div>
        <label>
          Caută {view === "accounts" ? "agenți" : "proprietăți"}
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={
              view === "accounts"
                ? "Nume, e-mail de autentificare sau agenție"
                : "Numele sau adresa proprietății"
            }
          />
        </label>
      </div>
      {owner && (
        <p>
          Proprietățile agentului <strong>{owner.name}</strong>.{" "}
          <button
            className="text-button"
            onClick={() => {
              setOwner(null);
              setPage(0);
            }}
          >
            Arată toți agenții
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="inline-edit-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Se încarcă {view}…</p>
      ) : (
        !error && (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    {(view === "accounts"
                      ? [
                          "Agent",
                          "E-mail de autentificare",
                          "Agenție / contact",
                          "Proprietăți",
                          "",
                        ]
                      : ["Proprietate", "Agent", "Adresă", "Stare", ""]
                    ).map((label, i) => (
                      <th key={i} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view === "accounts"
                    ? accounts.map((account) => (
                        <tr key={account.id}>
                          <td>
                            <strong>{account.name || "Agent fără nume"}</strong>
                            <small>
                              {account.last_sign_in_at
                                ? `Ultima autentificare: ${new Date(account.last_sign_in_at).toLocaleDateString("ro-RO")}`
                                : "Nicio autentificare înregistrată"}
                            </small>
                          </td>
                          <td>{account.login_email}</td>
                          <td>
                            {account.agency || "—"}
                            <small>
                              {account.phone || account.contact_email}
                            </small>
                          </td>
                          <td>{account.property_count}</td>
                          <td>
                            {account.deleting ? (
                              <span role="status">Ștergere în curs…</span>
                            ) : (
                              <>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setOwner({
                                      id: account.id,
                                      name: account.name || account.login_email,
                                    });
                                    setView("properties");
                                    setSearch("");
                                    setPage(0);
                                  }}
                                >
                                  Vezi proprietățile →
                                </button>
                                {account.id !== profile.id && (
                                  <DeleteAction
                                    label={`Șterge contul ${account.login_email}`}
                                    confirmation={`Ștergi definitiv contul ${account.login_email}, toate proprietățile, mesajele, fotografiile și filmele? Acțiunea nu poate fi anulată. Plățile existente nu sunt rambursate automat.`}
                                    onDelete={() =>
                                      remove("account", account.id)
                                    }
                                  />
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      ))
                    : properties.map((property) => (
                        <tr key={property.id}>
                          <td>
                            <strong>
                              {property.title || "Proprietate fără titlu"}
                            </strong>
                          </td>
                          <td>
                            {property.agent?.name || "Agent"}
                            <small>{property.agent?.email}</small>
                          </td>
                          <td>{property.location || "—"}</td>
                          <td>
                            {property.status === "published"
                              ? "Publicat"
                              : "Ciornă"}
                          </td>
                          <td>
                            <Link
                              className="text-button"
                              href={`/administrare/proprietati/${property.id}`}
                            >
                              Verifică proprietatea →
                            </Link>
                            <DeleteAction
                              label={`Șterge ${property.title || "proprietatea"}`}
                              confirmation={`Ștergi definitiv ${property.title || "această proprietate"}, fotografiile și filmul? Mesajele rămân în contul agentului. Plățile existente nu sunt rambursate automat.`}
                              onDelete={() => remove("property", property.id)}
                            />
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {!total && (
              <p>
                Nu au fost găsite locuri din categoria {view} corespunzătoare
                căutării.
              </p>
            )}
            <div className="admin-pagination">
              <span>
                {total} {view}
              </span>
              <button
                className="button secondary"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Înapoi
              </button>
              <span>Pagina {page + 1}</span>
              <button
                className="button secondary"
                disabled={(page + 1) * 25 >= total}
                onClick={() => setPage(page + 1)}
              >
                Următoarea
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}
