"use client";
import { useState, useRef } from "react";
import { Trash2 } from "lucide-react";
export function DeleteAction({
  label,
  confirmation,
  onDelete,
}: {
  label: string;
  confirmation: string;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function remove() {
    if (pending.current || !window.confirm(confirmation)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await onDelete();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Deletion failed. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <span className="delete-action-wrap">
      <button
        type="button"
        className="delete-action"
        aria-label={label}
        disabled={busy}
        onClick={remove}
      >
        <Trash2 size={14} />
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <span className="delete-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
