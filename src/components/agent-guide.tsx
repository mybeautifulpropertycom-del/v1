"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { agentGuideProgress } from "@/lib/agent-onboarding";
import { publicationPackages } from "@/lib/publication-packages";
import { useWorkspace } from "./workspace-provider";

type Tip = {
  key: string;
  title: string;
  body: string;
  anchor: HTMLElement;
  action: string;
  number: number;
  href?: string;
  focus?: HTMLElement;
  advance?: HTMLButtonElement;
  finish?: boolean;
  requirement?: string;
  editing?: boolean;
};
const find = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);
const target = (id: string) => find(`[data-guide-target="${CSS.escape(id)}"]`);
const control = (element: HTMLElement | null) =>
  element?.querySelector<HTMLElement>(
    'input:not([type="file"]), select, textarea',
  ) ?? undefined;
function navigationTarget(href: string) {
  const menu = target("mobile-menu");
  if (menu && menu.getBoundingClientRect().width > 0) return menu;
  return target(`nav-${href.split("/").pop()}`);
}

// Follow the focused field until blur, even if its value becomes valid mid-word.
// Outside a field, highlight the first required value still missing.
function fieldTip(
  group: "profile" | "property",
  next: HTMLElement | null,
  advance: HTMLButtonElement | null,
): Tip | null {
  const fields = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-guide-field="${group}"]`),
  );
  const focused = document.activeElement?.closest<HTMLElement>(
    `[data-guide-field="${group}"]`,
  );
  const missing = fields.filter(
    (field) => field.dataset.guideValid === "false",
  );
  const anchor = focused && fields.includes(focused) ? focused : missing[0];
  if (!anchor) return null;
  const valid = anchor.dataset.guideValid === "true";
  return {
    key: `field-${anchor.dataset.guideTarget}`,
    anchor,
    number: group === "profile" ? 1 : 2,
    title: anchor.dataset.guideTitle || "Datele proprietății",
    body:
      anchor.dataset.guideDescription ||
      "Completează informațiile pentru prezentare.",
    action:
      valid && !missing.length
        ? "Continuă"
        : valid
          ? "Următorul câmp"
          : "Completează câmpul",
    requirement: anchor.dataset.guideError,
    editing: control(anchor) === document.activeElement,
    ...(valid && !missing.length && advance
      ? { advance }
      : { focus: control(valid ? (missing[0] ?? next) : anchor) }),
  };
}

function GuideDialog({
  tip,
  busy,
  error,
  onClose,
  onDismiss,
  onAct,
}: {
  tip: Tip;
  busy: boolean;
  error: string;
  onClose: () => void;
  onDismiss: () => void;
  onAct: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const descriptionId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.current?.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      data-agent-guide-dialog
      className="guide-dialog"
      aria-label="Ghid de început"
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <div className="guide-tip-header">
        <h2>{tip.title}</h2>
        <span
          className="guide-tip-counter"
          aria-label={`Pasul ${tip.number} din 6`}
        >
          {tip.number} / 6
        </span>
        <button
          type="button"
          autoFocus
          className="guide-tip-collapse"
          aria-label="Restrânge indiciul"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <p id={descriptionId}>{tip.body}</p>
      {tip.requirement && (
        <p className="guide-tip-requirement">{tip.requirement}</p>
      )}
      {error && (
        <p className="guide-tip-error" role="alert">
          {error}
        </p>
      )}
      <div className="guide-tip-actions">
        <button
          type="button"
          className="guide-tip-dismiss"
          disabled={busy}
          onClick={onDismiss}
        >
          Închide ghidul
        </button>
        {tip.href ? (
          <Link href={tip.href} onClick={onClose}>
            {tip.action}
            <ArrowRight size={14} />
          </Link>
        ) : (
          <button
            type="button"
            className="guide-tip-next"
            disabled={
              busy ||
              Boolean(tip.advance && (tip.advance.disabled || tip.requirement))
            }
            onClick={onAct}
          >
            {busy ? "Se salvează…" : tip.action}
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </dialog>
  );
}

export function AgentGuide({ preview = false }: { preview?: boolean }) {
  const workspace = useWorkspace();
  const path = usePathname();
  const enabled =
    !workspace.demo && !workspace.isAdmin && workspace.guideStatus === "active";
  const progress = agentGuideProgress(workspace);
  const [tip, setTip] = useState<Tip | null>(null);
  const tipRef = useRef(tip);
  tipRef.current = tip;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panelId = useId();
  const open = Boolean(tip && openKey === tip.key);

  useEffect(() => {
    if (!enabled) {
      setTip(null);
      return;
    }
    function resolveTip(): Tip | null {
      // Keep the selected explanation stable while its modal owns focus.
      if (find("dialog[data-agent-guide-dialog][open]")) return tipRef.current;
      if (
        find(
          'dialog[open], [role="dialog"][aria-modal="true"], .sidebar-overlay',
        )
      )
        return null;
      const editor = find("[data-guide-editor-step]");
      if (editor && progress.step !== 0 && progress.step !== 3) {
        const step = Number(editor.dataset.guideEditorStep);
        const advance = find<HTMLButtonElement>(
          step === 2 ? "[data-guide-preview]" : "[data-guide-editor-next]",
        );
        if (step === 0) {
          const field = fieldTip("property", target("property-next"), advance);
          if (field) return field;
        }
        const anchor = target(
          ["property-next", "property-photos", "property-design"][step],
        );
        if (!anchor) return null;
        return {
          key: `editor-${step}`,
          number: step + 2,
          anchor,
          title: [
            "Detaliile proprietății",
            "Fotografiile proprietății",
            "Stilul prezentării",
          ][step],
          body: [
            "Detaliile esențiale sunt completate. Poți continua cu fotografiile.",
            "Încarcă fotografiile proprietății. Prima fotografie va fi coperta prezentării.",
            "Alege un model. În previzualizare vei putea verifica și edita textele înainte de publicare.",
          ][step],
          action: "Continuă",
          requirement: editor.dataset.guideRequirement || undefined,
          advance: advance ?? undefined,
        };
      }
      if (progress.step === 0) {
        if (path === "/panou/profil") {
          const save = find<HTMLButtonElement>(
            '[data-guide-target="profile-save"] button',
          );
          const field = fieldTip("profile", target("profile-save"), save);
          if (field) return field;
          const anchor = target("profile-save");
          if (!anchor) return null;
          return {
            key: "profile-save",
            number: 1,
            anchor,
            title: "Salvează profilul",
            body: "Datele de contact sunt pregătite. Salvează-le pentru a le folosi în prezentările proprietăților.",
            action: "Salvează profilul",
            advance: save ?? undefined,
          };
        }
        const anchor = navigationTarget("/panou/profil");
        if (!anchor) return null;
        return {
          key: "profile-link",
          number: 1,
          anchor,
          title: "Datele tale de contact",
          body: "Datele salvate în profil apar în prezentarea proprietății, astfel încât persoanele interesate să te poată contacta.",
          action: "Completează profilul",
          href: "/panou/profil",
        };
      }
      if (progress.step === 3) {
        const here = path === "/panou/mesaje";
        const anchor = here
          ? target("messages")
          : preview
            ? target("preview-back")
            : navigationTarget("/panou/mesaje");
        if (!anchor) return null;
        return {
          key: here ? "messages-inbox" : "messages-link",
          number: 6,
          anchor,
          title: "Solicitările, într-un singur loc",
          body: "În Mesaje ajung cererile de vizionare și mesajele din formularele proprietăților. Primești și notificări la e-mailul contului.",
          action: here ? "Am înțeles" : "Deschide mesajele",
          ...(here ? { finish: true } : { href: "/panou/mesaje" }),
        };
      }
      if (preview) {
        const anchor = target("publish");
        if (!anchor) return null;
        return {
          key: "publish",
          number: 5,
          anchor,
          title: "Publică atunci când ești pregătit",
          body: `De aici alegi prezentarea cu fotografii (${publicationPackages.photos.price} lei) sau cu videoclip (${publicationPackages.video.price} lei). Proprietatea se publică după confirmarea plății.`,
          action: "Am înțeles",
          focus: find("[data-guide-publish]") ?? undefined,
        };
      }
      const property = progress.property;
      if (path === "/panou/profil" && !target("next-property")) return null;
      const anchor =
        target("next-property") ??
        (property ? target(`property-${property.id}`) : null) ??
        target("add-property") ??
        navigationTarget("/panou");
      if (!anchor) return null;
      const ready = progress.step === 2;
      return {
        key: ready ? "preview-link" : "property-link",
        number: ready ? 5 : 2,
        anchor,
        title: ready
          ? "Verifică prezentarea"
          : property
            ? "Continuă proprietatea"
            : "Prima ta proprietate",
        body: ready
          ? "Verifică fotografiile și textele în previzualizare. Publici când prezentarea este pregătită."
          : "Adaugă detaliile și fotografiile proprietății. Poți salva o ciornă și reveni oricând.",
        action: ready
          ? "Vezi previzualizarea"
          : property
            ? "Continuă proprietatea"
            : "Adaugă o proprietate",
        href: ready
          ? `/previzualizare/${property!.id}`
          : property
            ? `/panou/proprietati/${property.id}`
            : "/panou/proprietati/noua",
      };
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = resolveTip();
        setTip((old) =>
          old?.key === next?.key &&
          old?.anchor === next?.anchor &&
          old?.advance === next?.advance &&
          old?.requirement === next?.requirement &&
          old?.editing === next?.editing &&
          old?.focus === next?.focus &&
          old?.href === next?.href
            ? old
            : next,
        );
      });
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-guide-editor-step",
        "data-guide-requirement",
        "data-guide-valid",
        "data-guide-error",
        "disabled",
        "aria-modal",
        "open",
      ],
    });
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled, path, preview, progress.step, progress.property?.id]);

  useLayoutEffect(() => {
    if (!enabled || !tip) return;
    const anchor = tip.anchor;
    anchor.dataset.guideActive = "true";
    const input = anchor.dataset.guideField ? control(anchor) : undefined;
    const measure = () => {
      if (!input) return;
      const field = input.getBoundingClientRect();
      const wrapper = anchor.getBoundingClientRect();
      anchor.style.setProperty(
        "--guide-control-top",
        `${field.top - wrapper.top}px`,
      );
      anchor.style.setProperty(
        "--guide-control-right",
        `${wrapper.right - field.right}px`,
      );
    };
    measure();
    // Only local layout changes matter. There is no scroll positioning loop.
    const observer = input ? new ResizeObserver(measure) : null;
    if (input) {
      observer?.observe(input);
      observer?.observe(anchor);
    }
    return () => {
      observer?.disconnect();
      delete anchor.dataset.guideActive;
      anchor.style.removeProperty("--guide-control-top");
      anchor.style.removeProperty("--guide-control-right");
    };
  }, [enabled, tip?.anchor]);

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
  function act() {
    if (!tip) return;
    if (tip.finish) {
      void close("completed");
      return;
    }
    if (tip.advance && (tip.advance.disabled || tip.requirement)) return;
    const { advance, focus } = tip;
    setOpenKey(null);
    requestAnimationFrame(() => {
      // Existing validation and saves run through their original buttons.
      // Publication/payment buttons are focus targets only.
      if (advance?.isConnected && !advance.disabled) advance.click();
      else if (focus?.isConnected) {
        focus.scrollIntoView({ behavior: "instant", block: "center" });
        focus.focus({ preventScroll: true });
      }
    });
  }
  const slot = tip?.anchor.querySelector<HTMLElement>("[data-guide-slot]");
  if (!enabled || !tip || !slot) return null;
  return (
    <>
      {createPortal(
        <span className="guide-coachmark">
          <button
            type="button"
            className="guide-beacon"
            tabIndex={tip.editing ? -1 : 0}
            aria-label={`Ghid: ${tip.title}`}
            title="Ghid de început"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => {
              setError("");
              setOpenKey(tip.key);
            }}
          >
            <span aria-hidden="true" />
          </button>
        </span>,
        slot,
      )}
      {open &&
        createPortal(
          <div id={panelId}>
            <GuideDialog
              tip={tip}
              busy={busy}
              error={error}
              onClose={() => setOpenKey(null)}
              onDismiss={() => void close("dismissed")}
              onAct={act}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
