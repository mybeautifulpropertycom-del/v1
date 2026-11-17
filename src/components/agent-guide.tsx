"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { agentGuideProgress } from "@/lib/agent-onboarding";
import { publicationPackages } from "@/lib/publication-packages";
import { useWorkspace } from "./workspace-provider";
import {
  completePropertyGuideThrough,
  nextPropertyGuideField,
  propertyGuideFields,
  type PropertyGuideField,
} from "@/lib/property-guide";
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
  requirement?: string;
  besideHeading?: boolean;
  fieldId?: PropertyGuideField;
  profileFieldId?: "agency" | "phone";
  highlight?: boolean;
  fieldTarget?: HTMLElement;
  editing?: boolean;
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
  const messagesOnly = workspace.guideCreationSeen && !preview;
  const [tip, setTip] = useState<Tip | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const beacon = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const autoOpened = useRef(new Set<string>());
  const tipRef = useRef(tip);
  tipRef.current = tip;
  const journey = useRef<{ key: string; done: Set<string> } | null>(null);
  const profileJourney = useRef<{ key: string; done: Set<string> } | null>(
    null,
  );
  const open = tip !== null && openKey === tip.key;
  const [inViewport, setInViewport] = useState(false);
  const [position, setPosition] = useState<
    (ReturnType<typeof guidePlacement> & { mode: "absolute" | "fixed" }) | null
  >(null);

  function fieldElement(id: string) {
    return find<HTMLElement>(`[data-property-guide-field="${id}"]`);
  }
  function fieldJourney() {
    const editor = find("[data-guide-property-id]");
    const key = `up-property-guide:${workspace.profile.id}:${editor?.dataset.guidePropertyId || ""}`;
    if (journey.current?.key !== key) {
      let stored: unknown = [];
      try {
        stored = JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        /* Memory is sufficient if storage is unavailable. */
      }
      const validIds = new Set<string>([
        ...propertyGuideFields.map((field) => field.id),
        "design",
      ]);
      journey.current = {
        key,
        done: new Set(
          Array.isArray(stored)
            ? stored.filter(
                (id): id is string =>
                  typeof id === "string" && validIds.has(id),
              )
            : [],
        ),
      };
    }
    return journey.current;
  }
  function remainingField() {
    const { done } = fieldJourney();
    const issues = Object.fromEntries(
      propertyGuideFields.map((field) => [
        field.id,
        fieldElement(field.id)?.dataset.guideIssue,
      ]),
    );
    const next = nextPropertyGuideField(done, issues);
    return next ? fieldElement(next.id) : null;
  }
  function rememberField(id: string) {
    const element = fieldElement(id);
    if (!element || element.dataset.guideIssue) return false;
    const state = fieldJourney();
    const issues = Object.fromEntries(
      propertyGuideFields.map((field) => [
        field.id,
        fieldElement(field.id)?.dataset.guideIssue,
      ]),
    );
    state.done = completePropertyGuideThrough(
      state.done,
      issues,
      id as PropertyGuideField,
    );
    persistJourney(state);
    return true;
  }
  function persistJourney(state: { key: string; done: Set<string> }) {
    try {
      localStorage.setItem(state.key, JSON.stringify([...state.done]));
    } catch {
      /* Keep the in-memory progress. */
    }
  }
  function profileFields() {
    const key = `up-profile-guide:${workspace.profile.id}`;
    if (profileJourney.current?.key !== key) {
      let done: string[] = [];
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(stored))
          done = stored.filter((id) => id === "agency" || id === "phone");
      } catch {
        /* Storage is optional. */
      }
      profileJourney.current = { key, done: new Set(done) };
    }
    return profileJourney.current;
  }
  function rememberProfileField(id: "agency" | "phone") {
    const input = find(`[data-profile-guide-field="${id}"]`);
    if (!input || input.dataset.guideIssue) return;
    const state = profileFields();
    state.done.add("agency");
    state.done.add(id);
    persistJourney(state);
  }

  useEffect(() => {
    if (enabled && preview && !workspace.guideCreationSeen)
      void workspace.markGuideCreationSeen();
  }, [
    enabled,
    preview,
    workspace.guideCreationSeen,
    workspace.markGuideCreationSeen,
  ]);

  useEffect(() => {
    if (!enabled) {
      setTip(null);
      return;
    }
    function resolveTip(): Tip | null {
      if (
        tipRef.current?.fieldId &&
        (panel.current?.contains(document.activeElement) ||
          beacon.current === document.activeElement)
      )
        return tipRef.current;
      // Leave menus, photo dialogs and payment dialogs unobstructed.
      if (
        find(
          'dialog[open], [role="dialog"][aria-modal="true"], .sidebar-overlay',
        )
      )
        return null;
      const editor = find("[data-guide-editor-step]");
      if (
        editor &&
        !messagesOnly &&
        progress.step !== 0 &&
        progress.step !== 3
      ) {
        const step = Number(editor.dataset.guideEditorStep);
        const focused =
          step === 0
            ? document.activeElement?.closest<HTMLElement>(
                "[data-property-guide-field]",
              )
            : null;
        const fieldTarget =
          step === 0
            ? (focused ?? remainingField() ?? find("[data-guide-editor-next]"))
            : find(
                step === 1
                  ? Number(editor.dataset.guidePhotoCount) > 0
                    ? "[data-guide-editor-next]"
                    : "[data-guide-photo-input]"
                  : fieldJourney().done.has("design")
                    ? "[data-guide-preview]"
                    : "[data-guide-design-input]",
              );
        const anchor = find(
          [
            "[data-guide-details-title]",
            "[data-guide-photos]",
            "[data-guide-design]",
          ][step],
        );
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
            "Completează informațiile locuinței. Apoi continuăm cu fotografiile.",
            "Încarcă fotografiile proprietății. Prima fotografie va fi coperta prezentării.",
            "Alege un model. În previzualizare vei putea verifica și edita textele înainte de publicare.",
          ][step],
          anchor,
          action: "Continuă",
          besideHeading: true,
          requirement: editor.dataset.guideRequirement || undefined,
          fieldId: fieldTarget?.dataset.propertyGuideField as
            PropertyGuideField | undefined,
          fieldTarget: fieldTarget ?? undefined,
          highlight: Boolean(fieldTarget),
          editing: Boolean(focused),
          advance:
            find<HTMLButtonElement>(
              step === 2 ? "[data-guide-preview]" : "[data-guide-editor-next]",
            ) ?? undefined,
        };
      }
      if (progress.step === 0 && !messagesOnly) {
        const done = profileFields().done;
        const phone = find<HTMLInputElement>(
          '[data-profile-guide-field="phone"]',
        );
        const profileFieldId = !done.has("agency")
          ? "agency"
          : !done.has("phone") || phone?.dataset.guideIssue
            ? "phone"
            : undefined;
        const contact =
          path === "/panou/profil"
            ? find<HTMLElement>(
                profileFieldId
                  ? `[data-profile-guide-field="${profileFieldId}"]`
                  : "[data-guide-profile-save]",
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
          action: contact
            ? profileFieldId
              ? "Continuă"
              : "Salvează profilul"
            : "Completează profilul",
          highlight: Boolean(contact),
          profileFieldId: contact ? profileFieldId : undefined,
          ...(contact
            ? profileFieldId
              ? {
                  focus:
                    profileFieldId === "agency"
                      ? (phone ?? contact)
                      : phone?.dataset.guideIssue
                        ? phone
                        : (find("[data-guide-profile-save]") ?? contact),
                }
              : { advance: contact as HTMLButtonElement }
            : { href: "/panou/profil" }),
        };
      }
      if (progress.step === 3 || messagesOnly) {
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
          old?.fieldTarget === next?.fieldTarget &&
          old?.fieldId === next?.fieldId &&
          old?.profileFieldId === next?.profileFieldId &&
          old?.focus === next?.focus &&
          old?.advance === next?.advance &&
          old?.requirement === next?.requirement &&
          old?.action === next?.action &&
          old?.editing === next?.editing &&
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
      attributeFilter: [
        "data-guide-editor-step",
        "data-guide-requirement",
        "data-guide-issue",
        "data-guide-empty",
        "data-guide-photo-count",
        "disabled",
        "aria-modal",
        "open",
      ],
    });
    let guidePointer = false;
    let pointerTimer: ReturnType<typeof setTimeout> | undefined;
    const pointer = (event: PointerEvent) => {
      guidePointer = Boolean(
        (event.target as Element).closest(".guide-coachmark"),
      );
      clearTimeout(pointerTimer);
      pointerTimer = setTimeout(() => {
        guidePointer = false;
      }, 0);
    };
    const blur = (event: FocusEvent) => {
      const element = (event.target as Element).closest<HTMLElement>(
        "[data-property-guide-field]",
      );
      const related = event.relatedTarget as Element | null;
      if (
        element &&
        !guidePointer &&
        !related?.closest(".guide-coachmark") &&
        !element.contains(related)
      )
        rememberField(element.dataset.propertyGuideField!);
      const contact = (event.target as Element).closest<HTMLElement>(
        "[data-profile-guide-field]",
      );
      if (contact && !guidePointer && !related?.closest(".guide-coachmark"))
        rememberProfileField(
          contact.dataset.profileGuideField as "agency" | "phone",
        );
      update();
    };
    const chooseDesign = (event: MouseEvent) => {
      if ((event.target as Element).closest("[data-guide-template-choice]")) {
        const state = fieldJourney();
        state.done.add("design");
        persistJourney(state);
        update();
      }
    };
    const skipSignupFields = (event: KeyboardEvent) => {
      if (
        path === "/panou/profil" &&
        progress.step === 0 &&
        !messagesOnly &&
        event.key === "Tab" &&
        !event.shiftKey &&
        (event.target as Element).matches('[data-profile-guide-field="agency"]')
      ) {
        const phone = find<HTMLInputElement>(
          '[data-profile-guide-field="phone"]',
        );
        if (phone) {
          event.preventDefault();
          phone.focus();
        }
      }
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("focusout", blur);
    document.addEventListener("focusin", update);
    document.addEventListener("input", update);
    document.addEventListener("change", update);
    document.addEventListener("click", chooseDesign);
    document.addEventListener("keydown", skipSignupFields);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      clearTimeout(pointerTimer);
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("focusin", update);
      document.removeEventListener("input", update);
      document.removeEventListener("change", update);
      document.removeEventListener("click", chooseDesign);
      document.removeEventListener("keydown", skipSignupFields);
      window.removeEventListener("resize", update);
    };
  }, [
    enabled,
    path,
    preview,
    progress.step,
    progress.property?.id,
    messagesOnly,
  ]);

  useLayoutEffect(() => {
    if (!enabled || !tip?.highlight) return;
    const field = tip.fieldTarget ?? tip.anchor;
    field.dataset.guideHighlight = "true";
    return () => {
      delete field.dataset.guideHighlight;
    };
  }, [enabled, tip?.anchor, tip?.fieldTarget, tip?.highlight]);

  useLayoutEffect(() => {
    if (!tip) {
      setPosition(null);
      return;
    }
    let frame = 0;
    let layoutWidth = innerWidth;
    let attached: {
      x: number;
      y: number;
      arrowX: number | null;
      arrowY: number;
      maxHeight: number;
    } | null = null;
    const pinned = () => {
      for (
        let element: HTMLElement | null = tip.anchor;
        element;
        element = element.parentElement
      ) {
        const placement = getComputedStyle(element).position;
        if (placement === "fixed" || placement === "sticky") return true;
      }
      return false;
    };
    const measure = (reset = false) => {
      if (reset) attached = null;
      const rect = tip.anchor.getBoundingClientRect();
      const mode = pinned() ? ("fixed" as const) : ("absolute" as const);
      const offsetX = mode === "absolute" ? scrollX : 0;
      const offsetY = mode === "absolute" ? scrollY : 0;
      const next = guidePlacement(
        rect,
        panel.current?.getBoundingClientRect().height ?? 220,
        {
          left: 0,
          top: 0,
          width: innerWidth,
          height: innerHeight,
        },
        { besideHeading: tip.besideHeading },
      );
      // Choose a side once, then retain that offset from the element.
      // Content/layout changes can move the element without flipping the card.
      attached ??= {
        x: next.x - rect.left,
        y: next.y - rect.top,
        arrowX: next.arrowX === null ? null : next.arrowX - rect.left,
        arrowY: next.arrowY - rect.top,
        maxHeight: next.maxHeight,
      };
      const stable = {
        ...next,
        mode,
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.left < innerWidth,
        x: rect.left + offsetX + attached.x,
        y: rect.top + offsetY + attached.y,
        dotX: next.dotX + offsetX,
        dotY:
          (tip.besideHeading
            ? rect.top + (rect.height - 30) / 2
            : rect.top - 14) + offsetY,
        arrowX:
          attached.arrowX === null
            ? null
            : rect.left + offsetX + attached.arrowX,
        arrowY: rect.top + offsetY + attached.arrowY,
        maxHeight: attached.maxHeight,
      };
      setPosition((old) =>
        JSON.stringify(old) === JSON.stringify(stable) ? old : stable,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure());
    };
    const resize = () => {
      // Mobile browser chrome and keyboards change height during scrolling.
      // Only a width change calls for a new responsive placement.
      if (innerWidth !== layoutWidth) {
        layoutWidth = innerWidth;
        measure(true);
      }
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(tip.anchor);
    const content = tip.anchor.closest<HTMLElement>(".workspace-main");
    if (content) observer.observe(content);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [tip?.key, tip?.anchor, open]);

  useEffect(() => {
    setInViewport(false);
    if (!tip) return;
    const observer = new IntersectionObserver((entries) =>
      setInViewport(entries.some((entry) => entry.isIntersecting)),
    );
    observer.observe(tip.anchor);
    return () => observer.disconnect();
  }, [tip?.anchor]);

  useEffect(() => {
    if (!enabled || !tip || !position?.visible || !inViewport || tip.editing)
      return;
    const key = `${workspace.profile.id}:${tip.key}`;
    if (autoOpened.current.has(key)) return;
    autoOpened.current.add(key);
    // Remember automatic openings on this browser. Closing the guide itself
    // remains account-wide through the existing Supabase state.
    const storageKey = `up-guide-opened:${workspace.profile.id}`;
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(storageKey) || "[]",
      );
      const seen = Array.isArray(saved)
        ? saved.filter((item): item is string => typeof item === "string")
        : [];
      if (seen.includes(tip.key)) return;
      localStorage.setItem(
        storageKey,
        JSON.stringify([...seen.slice(-20), tip.key]),
      );
    } catch {
      /* Private browsing still has the in-memory guard. */
    }
    setOpenKey(tip.key);
  }, [
    enabled,
    tip?.key,
    tip?.editing,
    position?.visible,
    inViewport,
    workspace.profile.id,
  ]);

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
    if (tip.advance?.disabled || tip.requirement) return;
    if (tip.fieldId) rememberField(tip.fieldId);
    if (tip.profileFieldId) rememberProfileField(tip.profileFieldId);
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
  const number = tip.key.startsWith("profile")
    ? 1
    : tip.key === "editor-1"
      ? 3
      : tip.key === "editor-2"
        ? 4
        : tip.key === "publish" || tip.key === "preview-link"
          ? 5
          : tip.key.startsWith("messages")
            ? 6
            : 2;
  return createPortal(
    <div className="guide-coachmark">
      <button
        ref={beacon}
        type="button"
        className="guide-beacon"
        style={{
          position: position.mode,
          left: position.dotX,
          top: position.dotY,
        }}
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
            position: position.mode,
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
            <h2>{tip.title}</h2>
            <span
              className="guide-tip-counter"
              aria-label={`Pasul ${number} din 6`}
            >
              {number} / 6
            </span>
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
          <p>{tip.body}</p>
          {tip.requirement && !tip.key.startsWith("editor-") && (
            <p
              className="guide-tip-requirement"
              id={`${panelId}-requirement`}
              aria-live="polite"
            >
              {tip.requirement}
            </p>
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
                disabled={
                  busy || tip.advance?.disabled || Boolean(tip.requirement)
                }
                aria-describedby={
                  tip.requirement && !tip.key.startsWith("editor-")
                    ? `${panelId}-requirement`
                    : undefined
                }
                onClick={act}
              >
                {busy ? "Se salvează…" : tip.action}
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      )}
      {open && position.arrowX !== null && (
        <span
          className="guide-tip-pointer"
          aria-hidden="true"
          style={{
            position: position.mode,
            left: position.arrowX,
            top: position.arrowY,
          }}
        />
      )}
    </div>,
    document.body,
  );
}
