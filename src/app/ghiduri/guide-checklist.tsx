"use client";

import { useEffect, useState } from "react";
import styles from "./guide-tools.module.css";

type ChecklistGroup = {
  title: string;
  items: readonly string[];
};

export function GuideChecklist({
  id,
  groups,
}: {
  id: string;
  groups: readonly ChecklistGroup[];
}) {
  const key = `mbp-guide:${id}`;
  const [checked, setChecked] = useState<string[]>([]);
  const items = groups.flatMap((group) => group.items);
  const count = items.filter((item) => checked.includes(item)).length;

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(
        window.localStorage.getItem(key) ?? "[]",
      );
      if (Array.isArray(stored)) {
        setChecked(
          stored.filter((value): value is string => typeof value === "string"),
        );
      }
    } catch {
      // The list is still usable when storage access is unavailable.
    }
  }, [key]);

  function save(next: string[]) {
    setChecked(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Keep the current selection available for this visit.
    }
  }

  return (
    <>
      <p>Bifează ce ai verificat. Lista se salvează în acest browser.</p>
      <div className={styles.progressRow}>
        <span role="status">
          {count} din {items.length} verificate
        </span>
        <button
          className={styles.clear}
          type="button"
          disabled={count === 0}
          onClick={() => save([])}
        >
          Resetează lista
        </button>
        <progress
          aria-label="Progresul verificărilor"
          value={count}
          max={items.length}
        />
      </div>
      {groups.map(({ title, items: groupItems }) => (
        <fieldset className={styles.checklistGroup} key={title}>
          <legend>{title}</legend>
          {groupItems.map((item) => (
            <label className={styles.check} key={item}>
              <input
                type="checkbox"
                checked={checked.includes(item)}
                onChange={(event) =>
                  save(
                    event.target.checked
                      ? [...checked, item]
                      : checked.filter((value) => value !== item),
                  )
                }
              />
              <span>{item}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </>
  );
}
