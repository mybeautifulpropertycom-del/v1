import type { Workspace } from "./model";
import { demoWorkspace } from "./demo";

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("my-beautiful-property-demo", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error("Stocarea locală nu este disponibilă în acest browser."),
      );
  });
}
export async function readDemo(): Promise<Workspace> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspace", "readonly");
    const request = tx.objectStore("workspace").get("state");
    tx.oncomplete = () => {
      db.close();
      resolve(request.result ?? demoWorkspace());
    };
    tx.onerror = () => {
      db.close();
      reject(new Error("Nu am putut încărca datele demonstrative."));
    };
  });
}
export async function writeDemo(workspace: Workspace): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspace", "readwrite");
    tx.objectStore("workspace").put(workspace, "state");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(
        new Error(
          "Stocarea locală este plină sau indisponibilă. Încearcă imagini mai mici.",
        ),
      );
    };
  });
}
