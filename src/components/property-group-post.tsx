"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Facebook,
  LoaderCircle,
  X,
} from "lucide-react";
import type { Property } from "@/lib/model";
import {
  propertyGroupPost,
  propertyShareLinks,
  propertyShareSource,
} from "@/lib/property-sharing";
import { requestPropertyShare } from "@/lib/request-property-share";
import {
  downloadSharePhotos,
  PropertyPhotoExportError,
} from "@/lib/property-share-photos";
import { PropertyImage } from "./property-image";
import { trapDialogFocus } from "./website-dialog-focus";

export function PropertyGroupPost({
  property,
  onClose,
}: {
  property: Property;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const edited = useRef(false);
  const downloadController = useRef<AbortController | null>(null);
  const [text, setText] = useState(() => propertyGroupPost(property));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [selected, setSelected] = useState(() =>
    property.images.map((_, index) => index),
  );
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [downloadError, setDownloadError] = useState("");
  const [retry, setRetry] = useState(0);
  const source = propertyShareSource(property);
  const cacheKey = `up-property-share:${property.owner_id}:${property.id}`;
  function remember(value: string) {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ source, text: value }));
    } catch {
      /* An unavailable cache does not prevent copying or downloading. */
    }
  }
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      downloadController.current?.abort();
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!retry) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
        if (
          saved?.source === source &&
          typeof saved.text === "string" &&
          saved.text.length > 0 &&
          saved.text.length <= 4000
        ) {
          setText(saved.text);
          setLoading(false);
          return;
        }
      } catch {
        /* Prepare a new draft if the cache is unavailable. */
      }
    }
    let active = true;
    setLoading(true);
    setError("");
    void requestPropertyShare(property)
      .then((result) => {
        if (!active || edited.current) return;
        setText(result);
        remember(result);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Textul cu AI nu a putut fi pregătit. Poți edita textul afișat.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [source, cacheKey, retry]);
  async function copyText() {
    edited.current = true;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(text);
      edited.current = true;
      remember(text);
      setCopied(true);
    } catch {
      textarea.current?.focus();
      textarea.current?.select();
      setCopyError(
        "Textul este selectat. Copiază-l din meniul telefonului sau cu Ctrl+C / Cmd+C.",
      );
    }
  }
  async function download() {
    if (downloading || !selected.length) return;
    setDownloading(true);
    setDownloaded(false);
    setCompleted(0);
    setDownloadError("");
    edited.current = true;
    remember(text);
    const controller = new AbortController();
    downloadController.current = controller;
    try {
      await downloadSharePhotos(
        property,
        selected,
        text,
        setCompleted,
        controller.signal,
      );
      setDownloaded(true);
    } catch (e) {
      if (!controller.signal.aborted)
        setDownloadError(
          e instanceof PropertyPhotoExportError
            ? e.message
            : "Fotografiile nu au putut fi descărcate. Încearcă din nou.",
        );
    } finally {
      setDownloading(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="property-group-dialog"
      aria-labelledby="group-post-title"
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="property-group-heading">
        <div>
          <span className="eyebrow">DISTRIBUIE PROPRIETATEA</span>
          <h2 id="group-post-title">Pregătește postarea pentru grupuri</h2>
        </div>
        <button
          type="button"
          className="property-group-close"
          aria-label="Închide pregătirea postării"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p className="property-group-intro">
        Pregătește textul, apoi deschide fereastra de distribuire Facebook.
        Acolo alege un grup ca destinație și adaugă textul postării.
      </p>
      <label className="property-group-text">
        Textul postării
        <textarea
          ref={textarea}
          rows={10}
          maxLength={4000}
          value={text}
          onChange={(event) => {
            edited.current = true;
            setText(event.target.value);
            remember(event.target.value);
            setCopied(false);
          }}
        />
      </label>
      <div className="property-group-text-actions">
        <span role="status">
          {loading ? (
            <>
              <LoaderCircle className="spin" size={14} /> Pregătim textul cu AI…
            </>
          ) : (
            "Poți adapta textul înainte de publicare."
          )}
        </span>
        <button
          type="button"
          className="button secondary"
          onClick={copyText}
          disabled={!text.trim()}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Text copiat" : "Copiază textul"}
        </button>
      </div>
      {copyError && (
        <p className="property-group-error" role="alert">
          {copyError}
        </p>
      )}
      {error && (
        <div className="property-group-error" role="alert">
          <p>{error}</p>
          {!loading && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                edited.current = false;
                setRetry((value) => value + 1);
              }}
            >
              Încearcă din nou cu AI
            </button>
          )}
        </div>
      )}
      <div className="property-group-photos-heading">
        <h3>
          Fotografiile postării{" "}
          <span>
            {selected.length} / {property.images.length}
          </span>
        </h3>
        <button
          type="button"
          className="text-button"
          disabled={downloading}
          onClick={() => {
            setSelected(
              selected.length === property.images.length
                ? []
                : property.images.map((_, index) => index),
            );
            setDownloaded(false);
          }}
        >
          {selected.length === property.images.length
            ? "Deselectează"
            : "Selectează toate"}
        </button>
      </div>
      <div
        className="property-group-photos"
        aria-label="Selectează fotografiile pentru postare"
      >
        {property.images.map((image, index) => (
          <button
            key={image}
            type="button"
            disabled={downloading}
            aria-label={`Fotografia ${index + 1}`}
            aria-pressed={selected.includes(index)}
            onClick={() => {
              setSelected((current) =>
                current.includes(index)
                  ? current.filter((item) => item !== index)
                  : [...current, index],
              );
              setDownloaded(false);
            }}
          >
            <PropertyImage
              src={image}
              alt=""
              sizes="(max-width: 600px) 30vw, 140px"
            />
            <span aria-hidden="true">
              {selected.includes(index) ? <Check size={14} /> : index + 1}
            </span>
          </button>
        ))}
      </div>
      <div className="property-group-download">
        <button
          type="button"
          className="button secondary"
          onClick={download}
          disabled={downloading || !selected.length}
        >
          {downloading ? (
            <LoaderCircle className="spin" size={16} />
          ) : downloaded ? (
            <Check size={16} />
          ) : (
            <Download size={16} />
          )}
          {downloading
            ? `Se pregătesc fotografiile… ${completed}/${selected.length}`
            : downloaded
              ? "Fotografii descărcate"
              : "Descarcă fotografiile"}
        </button>
        <small>
          Primești o arhivă ZIP cu fotografiile JPG și textul postării. Le poți
          folosi și pentru o postare nouă cu fotografii în grup. Dezarhivează
          arhiva înainte de a atașa imaginile.
        </small>
      </div>
      {downloadError && (
        <p className="property-group-error" role="alert">
          {downloadError}
        </p>
      )}
      <div className="property-group-footer">
        <p>În Facebook, alege „Distribuie într-un grup”, apoi grupul dorit.</p>
        <a
          className="button primary"
          href={propertyShareLinks(property)!.facebook}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Facebook size={16} /> Deschide distribuirea pe Facebook{" "}
          <ExternalLink size={14} />
        </a>
      </div>
    </dialog>
  );
}
