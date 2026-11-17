"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { agentGuideProgress, guideSteps } from "@/lib/agent-onboarding";
import { publicationPackages } from "@/lib/publication-packages";
import { useWorkspace } from "./workspace-provider";

export function AgentGuide({ preview = false }: { preview?: boolean }) {
  const workspace = useWorkspace();
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (workspace.demo || workspace.isAdmin || workspace.guideStatus !== "active")
    return null;
  const { step, property } = agentGuideProgress(workspace);
  const inEditor = path.startsWith("/panou/proprietati/");
  const inProfile = path === "/panou/profil";
  const inMessages = path === "/panou/mesaje";
  const title = [
    "Completează datele tale",
    "Adaugă prima proprietate",
    "Verifică prezentarea și publică",
    "Aici primești solicitările",
  ][step];
  const description = [
    "Adaugă numele, telefonul și e-mailul de contact, apoi salvează profilul. Aceste date vor apărea în prezentarea proprietății.",
    "Completează detaliile proprietății, încarcă fotografiile și alege un model. Poți salva și reveni oricând la ciornă.",
    `Verifică textele și fotografiile în previzualizare, apoi apasă „Publică proprietatea”. Alegi prezentarea cu fotografii (${publicationPackages.photos.price} lei) sau cu videoclip (${publicationPackages.video.price} lei). Publicarea are loc după confirmarea plății.`,
    "În Mesaje vei găsi cererile de vizionare și mesajele trimise prin formularele proprietăților tale. Primești și o notificare la adresa de e-mail a contului.",
  ][step];
  const href =
    step === 0
      ? "/panou/profil"
      : step === 1
        ? property
          ? `/panou/proprietati/${property.id}`
          : "/panou/proprietati/noua"
        : step === 2
          ? `/previzualizare/${property!.id}`
          : "/panou/mesaje";
  const localTarget =
    step === 0 && inProfile
      ? "[data-guide-contact] input:not([type=file])"
      : (step === 1 || step === 2) && inEditor
        ? "[data-guide-editor] button.active"
        : step === 2 && preview
          ? "[data-guide-publish]"
          : null;
  const action =
    step === 0
      ? "Completează profilul"
      : step === 1
        ? property
          ? "Continuă proprietatea"
          : "Adaugă o proprietate"
        : step === 2
          ? preview
            ? "Mergi la publicare"
            : inEditor
              ? "Continuă în editor"
              : "Verifică prezentarea"
          : "Deschide mesajele";
  async function close(status: "dismissed" | "completed") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await workspace.closeGuide(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Încearcă din nou.");
    } finally {
      setBusy(false);
    }
  }
  function focusAction() {
    const target =
      (step === 2 && inEditor
        ? document.querySelector<HTMLElement>("[data-guide-preview]")
        : null) ?? document.querySelector<HTMLElement>(localTarget!);
    target?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
    target?.focus({ preventScroll: true });
  }
  return (
    <section
      className={`agent-guide${preview ? " agent-guide-preview" : ""}`}
      aria-label="Ghid de început"
    >
      <div className="agent-guide-top">
        <span>
          Ghid de început <span aria-hidden="true">·</span> Pasul {step + 1} din{" "}
          {guideSteps.length}
        </span>
        <button
          type="button"
          className="agent-guide-dismiss"
          disabled={busy}
          onClick={() => void close("dismissed")}
        >
          Mă descurc singur
        </button>
      </div>
      <ol
        className="agent-guide-steps"
        aria-label="Pașii pentru prima publicare"
      >
        {guideSteps.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={index < step ? "done" : ""}
          >
            <span className="agent-guide-number" aria-hidden="true">
              {index < step ? <Check size={12} /> : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <div className="agent-guide-content">
        <div>
          <h2 className="agent-guide-title">{title}</h2>
          <p>{description}</p>
        </div>
        {step === 3 && inMessages ? (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void close("completed")}
          >
            {busy ? "Se salvează…" : "Am înțeles"}
            <Check size={15} />
          </button>
        ) : localTarget ? (
          <button
            type="button"
            className="button secondary"
            onClick={focusAction}
          >
            {action}
            <ArrowRight size={15} />
          </button>
        ) : (
          <Link className="button secondary" href={href}>
            {action}
            <ArrowRight size={15} />
          </Link>
        )}
      </div>
      {error && (
        <p className="agent-guide-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
