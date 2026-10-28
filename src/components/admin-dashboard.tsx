"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWorkspace } from "./workspace-provider";
import { adminRequest } from "@/lib/admin-client";

type Account = {
  id: string;
  name: string;
  login_email: string;
  contact_email: string;
  phone: string;
  agency: string;
  property_count: number;
  last_sign_in_at: string | null;
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
  const { isAdmin } = useWorkspace();
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
  }, [isAdmin, view, owner, page, search]);
  if (!isAdmin)
    return (
      <div className="state-screen">
        <h1>Administrator access required.</h1>
        <Link href="/dashboard">Return to your workspace</Link>
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
        <span className="eyebrow">YOUR PLATFORM</span>
        <h1>A clear view of every property.</h1>
        <p>
          Review agent accounts and publish selected properties at no charge,
          including their cinematic walkthrough.
        </p>
      </header>
      <div className="admin-controls">
        <div className="admin-tabs" aria-label="Administration views">
          <button
            className="button secondary"
            aria-pressed={view === "accounts"}
            onClick={() => changeView("accounts")}
          >
            Agent accounts
          </button>
          <button
            className="button secondary"
            aria-pressed={view === "properties"}
            onClick={() => changeView("properties")}
          >
            All properties
          </button>
        </div>
        <label>
          Search {view === "accounts" ? "agents" : "properties"}
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={
              view === "accounts"
                ? "Name, login email or agency"
                : "Property name or location"
            }
          />
        </label>
      </div>
      {owner && (
        <p>
          Properties belonging to <strong>{owner.name}</strong>.{" "}
          <button
            className="text-button"
            onClick={() => {
              setOwner(null);
              setPage(0);
            }}
          >
            Show all agents
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="inline-edit-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading {view}…</p>
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
                          "Login email",
                          "Agency / contact",
                          "Properties",
                          "",
                        ]
                      : ["Property", "Agent", "Location", "Status", ""]
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
                            <strong>{account.name || "Unnamed agent"}</strong>
                            <small>
                              {account.last_sign_in_at
                                ? `Last sign-in: ${new Date(account.last_sign_in_at).toLocaleDateString("en-US")}`
                                : "No sign-in recorded"}
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
                              View properties →
                            </button>
                          </td>
                        </tr>
                      ))
                    : properties.map((property) => (
                        <tr key={property.id}>
                          <td>
                            <strong>
                              {property.title || "Untitled property"}
                            </strong>
                          </td>
                          <td>
                            {property.agent?.name || "Agent"}
                            <small>{property.agent?.email}</small>
                          </td>
                          <td>{property.location || "—"}</td>
                          <td>
                            {property.status === "published"
                              ? "Published"
                              : "Draft"}
                          </td>
                          <td>
                            <Link
                              className="text-button"
                              href={`/admin/properties/${property.id}`}
                            >
                              Review property →
                            </Link>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {!total && <p>No {view} match this search.</p>}
            <div className="admin-pagination">
              <span>
                {total} {view}
              </span>
              <button
                className="button secondary"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {page + 1}</span>
              <button
                className="button secondary"
                disabled={(page + 1) * 25 >= total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}
