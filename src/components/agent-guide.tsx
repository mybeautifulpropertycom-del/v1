"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { agentGuideProgress } from "@/lib/agent-onboarding";
import { publicationPackages } from "@/lib/publication-packages";
import { useWorkspace } from "./workspace-provider";
import { guidePlacement } from "@/lib/guide-placement";

type Tip = {
  key: string;
  label: string;
  title: string;
  body: string;
  anchor: HTMLElement;
  action: string;
  href?: string;
  focus?: HTMLElement;
  advance?: HTMLButtonElement;
  finish?: boolean;
};
const find = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);
function inView(element: HTMLElement | null) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.left < innerWidth
  );
}
function navigationTarget(href: string) {
  const menu = find("[data-guide-menu]");
  if (inView(menu)) return menu;
  const link = find(`.sidebar nav a[href="${href}"]`);
  return inView(link) ? link : null;
}

export function AgentGuide({ preview = false }: { preview?: boolean }) {
  const workspace = useWorkspace();
  const path = usePathname();
  const enabled =
    !workspace.demo && !workspace.isAdmin && workspace.guideStatus === "active";
  const progress = agentGuideProgress(workspace);
  const [tip, setTip] = useState<Tip | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const beacon = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const open = tip !== null && openKey === tip.key;
  const [position, setPosition] = useState<ReturnType<
    typeof guidePlacement
  > | null>(null);

  useEffect(() => {
    if (!enabled) {
      setTip(null);
      return;
    }
    function resolveTip(): Tip | null {
      // Leave menus, photo dialogs and payment dialogs unobstructed.
      if (
        find(
          'dialog[open], [role="dialog"][aria-modal="true"], .sidebar-overlay',
        )
      )
        return null;
      const editor = find("[data-guide-editor-step]");
      if (editor && progress.step !== 0 && progress.step !== 3) {
        const step = Number(editor.dataset.guideEditorStep);
        const selectors = [
          "[data-guide-details]",
          "[data-guide-photos]",
          "[data-guide-design]",
        ];
        const anchor = find(selectors[step]);
        if (!anchor) return null;
        return {
          key: `editor-${step}`,
          label: ["Detaliile", "Fotografiile", "Modelul"][step],
          title: [
            "Detaliile proprietății",
            "Fotografiile proprietății",
            "Stilul prezentării",
          ][step],
          body: [
            "Completează adresa, prețul și detaliile locuinței. Apoi continuă cu fotografiile.",
            "Încarcă fotografiile proprietății. Prima fotografie va fi coperta prezentării.",
            "Alege un model. În previzualizare vei putea verifica și edita textele înainte de publicare.",
          ][step],
          anchor,
          action: [
            "Adaugă fotografiile",
            "Alege modelul",
            "Vezi previzualizarea",
          ][step],
          advance:
            find<HTMLButtonElement>(
              step === 2 ? "[data-guide-preview]" : "[data-guide-editor-next]",
            ) ?? undefined,
        };
      }
      if (progress.step === 0) {
        const contact =
          path === "/panou/profil"
            ? find<HTMLInputElement>(
                "[data-guide-contact] input:not([type=file])",
              )
            : null;
        const anchor = contact ?? navigationTarget("/panou/profil");
        if (!anchor) return null;
        return {
          key: contact ? "profile-contact" : "profile-link",
          label: "Profilul tău",
          title: "Datele tale de contact",
          body: "Datele salvate în profil apar în prezentarea proprietății, astfel încât persoanele interesate să te poată contacta.",
          anchor,
          action: "Completează profilul",
          ...(contact ? { focus: contact } : { href: "/panou/profil" }),
        };
      }
      if (progress.step === 3) {
        const here = path === "/panou/mesaje";
        const anchor = here
          ? find("[data-guide-messages]")
          : preview
            ? find("[data-guide-back]")
            : navigationTarget("/panou/mesaje");
        if (!anchor) return null;
        return {
          key: here ? "messages-inbox" : "messages-link",
          label: "Mesajele",
          title: "Solicitările, într-un singur loc",
          body: "În Mesaje ajung cererile de vizionare și mesajele din formularele proprietăților. Primești și notificări la e-mailul contului.",
          anchor,
          action: here ? "Am înțeles" : "Deschide mesajele",
          ...(here ? { finish: true } : { href: "/panou/mesaje" }),
        };
      }
      if (preview) {
        const anchor = find<HTMLButtonElement>("[data-guide-publish]");
        if (!anchor) return null;
        return {
          key: "publish",
          label: "Publicarea",
          title: "Publică atunci când ești pregătit",
          body: `De aici alegi prezentarea cu fotografii (${publicationPackages.photos.price} lei) sau cu videoclip (${publicationPackages.video.price} lei). Proprietatea se publică după confirmarea plății.`,
          anchor,
          action: "Am înțeles",
          focus: anchor,
        };
      }
      const property = progress.property;
      const propertyLink = property
        ? find<HTMLAnchorElement>(
            `[data-guide-property="${CSS.escape(property.id)}"]`,
          )
        : null;
      const addLink = find<HTMLAnchorElement>("[data-guide-add-property]");
      const nextLink = find<HTMLAnchorElement>("[data-guide-next-property]");
      if (path === "/panou/profil" && !nextLink) return null;
      const anchor =
        nextLink ?? propertyLink ?? addLink ?? navigationTarget("/panou");
      if (!anchor) return null;
      const ready = progress.step === 2;
      return {
        key: ready ? "preview-link" : "property-link",
        label: "Proprietatea",
        title: ready
          ? "Verifică prezentarea"
          : property
            ? "Continuă proprietatea"
            : "Prima ta proprietate",
        body: ready
          ? "Verifică fotografiile și textele în previzualizare. Publici când prezentarea este pregătită."
          : "Adaugă detaliile și fotografiile proprietății. Poți salva o ciornă și reveni oricând.",
        anchor,
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
    function update() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = resolveTip();
        setTip((old) =>
          old?.key === next?.key &&
          old?.anchor === next?.anchor &&
          old?.advance === next?.advance &&
          old?.href === next?.href
            ? old
            : next,
        );
      });
    }
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-guide-editor-step", "aria-modal", "open"],
    });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [enabled, path, preview, progress.step, progress.property?.id]);

  useLayoutEffect(() => {
    if (!tip) {
      setPosition(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const next = guidePlacement(
          tip.anchor.getBoundingClientRect(),
          panel.current?.getBoundingClientRect().height ?? 220,
          {
            left: viewport?.offsetLeft ?? 0,
            top: viewport?.offsetTop ?? 0,
            width: viewport?.width ?? innerWidth,
            height: viewport?.height ?? innerHeight,
          },
        );
        setPosition((old) =>
          JSON.stringify(old) === JSON.stringify(next) ? old : next,
        );
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tip.anchor);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [tip, open, error]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (
        !panel.current?.contains(event.target as Node) &&
        !beacon.current?.contains(event.target as Node)
      )
        setOpenKey(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenKey(null);
        beacon.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

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
    if (tip.advance?.disabled) return;
    setOpenKey(null);
    if (tip.advance) {
      // Use the editor's existing save/validation flow. Never click publication/payment.
      tip.advance.click();
    } else if (tip.focus) {
      tip.focus.scrollIntoView({ behavior: "instant", block: "center" });
      tip.focus.focus({ preventScroll: true });
    }
  }
  if (!enabled || !tip || !position?.visible) return null;
  return createPortal(
    <div className="guide-coachmark">
      <button
        ref={beacon}
        type="button"
        className="guide-beacon"
        style={{ left: position.dotX, top: position.dotY }}
        aria-label={`Ghid: ${tip.title}`}
        title="Ghid de început"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setError("");
          setOpenKey(open ? null : tip.key);
        }}
      >
        <span aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panel}
          id={panelId}
          className="guide-tip"
          style={{
            left: position.x,
            top: position.y,
            width: position.width,
            maxHeight: position.maxHeight,
          }}
          role="dialog"
          aria-modal="false"
          aria-label="Ghid de început"
        >
          <div className="guide-tip-header">
            <span>{tip.label}</span>
            <button
              type="button"
              className="guide-tip-collapse"
              aria-label="Restrânge indiciul"
              onClick={() => {
                setOpenKey(null);
                beacon.current?.focus();
              }}
            >
              <X size={14} />
            </button>
          </div>
          <h2>{tip.title}</h2>
          <p>{tip.body}</p>
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
              onClick={() => void close("dismissed")}
            >
              Închide ghidul
            </button>
            {tip.href ? (
              <Link href={tip.href} onClick={() => setOpenKey(null)}>
                {tip.action}
                <ArrowRight size={13} />
              </Link>
            ) : (
              <button
                type="button"
                className="guide-tip-next"
                disabled={busy || tip.advance?.disabled}
                onClick={act}
              >
                {busy ? "Se salvează…" : tip.action}
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
