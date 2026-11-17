"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { BrandSymbol } from "./brand-symbol";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, X } from "lucide-react";
import type { Profile, Property, Workspace } from "@/lib/model";
import {
  MAX_PROFILE_BIO_LENGTH,
  propertyErrors,
  publicationErrors,
  slugify,
} from "@/lib/model";
import { readDemo, writeDemo } from "@/lib/demo-storage";
import { uploadPropertyPhoto } from "@/lib/photo-upload";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { useUnreadInquiries } from "./use-unread-inquiries";
import { useAgentOnboarding } from "./use-agent-onboarding";
import type { GuideStatus } from "@/lib/agent-onboarding";

type WorkspaceContext = Workspace & {
  demo: boolean;
  isAdmin: boolean;
  unreadCount: number;
  guideStatus: GuideStatus | null;
  closeGuide: (status: "dismissed" | "completed") => Promise<void>;
  refreshUnread: () => Promise<void>;
  saveProfile: (profile: Profile) => Promise<void>;
  saveProperty: (property: Property, publish?: boolean) => Promise<Property>;
  uploadImage: (
    file: File,
    propertyId: string,
    onProgress?: (fraction: number) => void,
  ) => Promise<string>;
  uploadAvatar: (file: File) => Promise<string>;
  deleteProperty: (property: Property) => Promise<void>;
  refreshProperty: (id: string) => Promise<Property | null>;
  notify: (message: string) => void;
  signOut: () => Promise<void>;
};
const Context = createContext<WorkspaceContext | null>(null);
export function useWorkspace(): WorkspaceContext {
  const context = useContext(Context);
  if (!context) throw new Error("WorkspaceProvider is required");
  return context;
}

async function optimizeImage(file: File, maxSide = 2000): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Alege o imagine JPG, PNG sau WebP.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Fiecare imagine poate avea maximum 10 MB.");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Browserul nu a putut procesa imaginea.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob?.type === "image/webp"
          ? resolve(blob)
          : reject(new Error("Imaginea nu a putut fi procesată.")),
      "image/webp",
      0.86,
    ),
  );
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<Workspace | null>(null);
  const stateRef = useRef<Workspace | null>(null);
  const { unreadCount, refreshUnread } = useUnreadInquiries(state?.profile.id);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const { guideStatus, closeGuide } = useAgentOnboarding(
    state?.profile.id,
    isAdmin,
  );
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((message: string) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const commit = useCallback((value: Workspace) => {
    stateRef.current = value;
    setState(value);
  }, []);

  useEffect(() => {
    let active = true;
    const supabase = getSupabase();
    async function load() {
      try {
        if (!supabase) {
          const data = await readDemo();
          if (active) commit(data);
          return;
        }
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError || !user) {
          router.replace("/autentificare");
          return;
        }
        const [profileResult, propertyResult, adminResult] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).single(),
          supabase
            .from("properties")
            .select("*")
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false }),
          supabase.rpc("is_platform_admin"),
        ]);
        if (profileResult.error || propertyResult.error)
          throw new Error(
            "Nu am putut încărca spațiul de lucru. Verifică conexiunea și configurarea Supabase.",
          );
        if (active) {
          setIsAdmin(!adminResult.error && adminResult.data === true);
          commit({
            profile: profileResult.data as Profile,
            properties: propertyResult.data as Property[],
          });
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Conexiunea nu este disponibilă.",
          );
      }
    }
    void load();
    const subscription = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/autentificare");
    });
    return () => {
      active = false;
      subscription?.data.subscription.unsubscribe();
      clearTimeout(timer.current);
    };
  }, [commit, router]);

  const refreshProperty = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      if (!supabase)
        return stateRef.current?.properties.find((p) => p.id === id) ?? null;
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .eq("owner_id", stateRef.current!.profile.id)
        .single();
      if (error)
        throw new Error(
          "Proprietatea nu a putut fi actualizată. Reîncarcă pagina.",
        );
      const property = data as Property;
      commit({
        ...stateRef.current!,
        properties: stateRef.current!.properties.map((p) =>
          p.id === id ? property : p,
        ),
      });
      return property;
    },
    [commit],
  );
  async function saveProfile(profile: Profile) {
    if (profile.bio.length > MAX_PROFILE_BIO_LENGTH)
      throw new Error(
        `Shorten your introduction to ${MAX_PROFILE_BIO_LENGTH} characters or fewer before saving.`,
      );
    const current = stateRef.current!;
    const supabase = getSupabase();
    if (supabase) {
      const { error, data } = await supabase
        .from("profiles")
        .update({
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          agency: profile.agency,
          bio: profile.bio,
          ...(profile.avatar_url !== undefined
            ? { avatar_url: profile.avatar_url }
            : {}),
        })
        .eq("id", current.profile.id)
        .select("*")
        .single();
      if (error)
        throw new Error(
          "Profilul nu a fost salvat. Verifică conexiunea și încearcă din nou.",
        );
      profile = { ...profile, profile_completed_at: data.profile_completed_at };
    }
    const next = { ...stateRef.current!, profile };
    if (!supabase) await writeDemo(next);
    commit(next);
  }

  async function saveProperty(property: Property, publish = false) {
    const current = stateRef.current!;
    const nextProperty = {
      ...property,
      owner_id: current.profile.id,
      updated_at: new Date().toISOString(),
    };
    const fieldErrors = propertyErrors(nextProperty);
    if (fieldErrors.length) throw new Error(fieldErrors.join(" "));
    if (publish || nextProperty.status === "published") {
      const errors = publicationErrors(nextProperty, current.profile);
      if (errors.length) throw new Error(errors.join(" "));
      nextProperty.status = "published";
    }
    const existing = current.properties.find((p) => p.id === property.id);
    if (!existing)
      nextProperty.slug = `${slugify(property.title)}-${property.id}`;
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("properties")
        .upsert(nextProperty)
        .select("*")
        .single();
      if (error)
        throw new Error(
          error.code === "P0402"
            ? "Alege varianta de publicare și finalizează plata în editorul prezentării înainte de publicarea proprietății."
            : "Proprietatea nu a fost salvată. Verifică detaliile și conexiunea, apoi încearcă din nou.",
        );
      Object.assign(nextProperty, data);
    }
    const next = {
      ...stateRef.current!,
      properties: existing
        ? stateRef.current!.properties.map((p) =>
            p.id === nextProperty.id ? nextProperty : p,
          )
        : [nextProperty, ...stateRef.current!.properties],
    };
    if (!supabase) await writeDemo(next);
    commit(next);
    return nextProperty;
  }

  async function uploadImage(
    file: File,
    propertyId: string,
    onProgress?: (fraction: number) => void,
  ) {
    const blob = await optimizeImage(file);
    const supabase = getSupabase();
    if (!supabase)
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          onProgress?.(1);
          resolve(reader.result as string);
        };
        reader.onerror = () => reject(new Error("Nu am putut citi imaginea."));
        reader.readAsDataURL(blob);
      });
    const path = `${stateRef.current!.profile.id}/${propertyId}/${crypto.randomUUID()}.webp`;
    await uploadPropertyPhoto(supabase, path, blob, onProgress);
    return supabase.storage.from("property-images").getPublicUrl(path).data
      .publicUrl;
  }

  async function uploadAvatar(file: File) {
    const blob = await optimizeImage(file, 512);
    const supabase = getSupabase();
    if (!supabase)
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Fotografia nu a putut fi citită."));
        reader.readAsDataURL(blob);
      });
    const path = `${stateRef.current!.profile.id}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage
      .from("agent-avatars")
      .upload(path, blob, { contentType: "image/webp", upsert: false });
    if (error)
      throw new Error(
        "Fotografia de profil nu a putut fi încărcată. Verifică configurarea stocării și încearcă din nou.",
      );
    return supabase.storage.from("agent-avatars").getPublicUrl(path).data
      .publicUrl;
  }

  async function deleteProperty(property: Property) {
    const owner = stateRef.current!.profile.id;
    if (property.owner_id !== owner)
      throw new Error("Proprietatea nu se află în contul tău.");
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase.rpc("delete_owned_property", {
        property_id: property.id,
      });
      if (error || data !== true)
        throw new Error(
          "Proprietatea nu a putut fi ștearsă. Verifică actualizarea bazei de date și conexiunea, apoi încearcă din nou.",
        );
    }
    const next = {
      ...stateRef.current!,
      properties: stateRef.current!.properties.filter(
        (p) => p.id !== property.id,
      ),
    };
    if (!supabase) await writeDemo(next);
    commit(next);
    notify(
      "Proprietatea a fost ștearsă. Pagina publică nu mai este disponibilă. Mesajele rămân în inbox.",
    );
    if (supabase) {
      // Remove only saved images in this owner's exact property folder.
      const prefix = `/storage/v1/object/public/property-images/${owner}/${property.id}/`;
      const paths = property.images.flatMap((image) => {
        try {
          const url = new URL(image);
          return url.origin ===
            new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin &&
            url.pathname.startsWith(prefix) &&
            /^[a-zA-Z0-9_-]+\.(webp|png|jpe?g)$/i.test(
              url.pathname.slice(prefix.length),
            )
            ? [
                url.pathname.slice(
                  "/storage/v1/object/public/property-images/".length,
                ),
              ]
            : [];
        } catch {
          return [];
        }
      });
      if (paths.length) {
        try {
          const { error } = await supabase.storage
            .from("property-images")
            .remove(paths);
          if (error)
            notify(
              "Proprietatea a fost ștearsă. Unele fotografii nu au putut fi eliminate din stocare.",
            );
        } catch {
          notify(
            "Proprietatea a fost ștearsă. Unele fotografii nu au putut fi eliminate din stocare.",
          );
        }
      }
    }
  }

  async function signOut() {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        notify("Deconectarea a eșuat. Încearcă din nou.");
        return;
      }
    }
    router.push("/autentificare");
  }

  if (error)
    return (
      <div className="state-screen">
        <BrandSymbol />
        <h1>Să restabilim conexiunea.</h1>
        <p>{error}</p>
        <button className="button primary" onClick={() => location.reload()}>
          Încearcă din nou
        </button>
      </div>
    );
  if (!state)
    return (
      <div className="state-screen">
        <BrandSymbol />
        <LoaderCircle className="spin" />
        <p>Se pregătește spațiul de lucru…</p>
      </div>
    );
  return (
    <Context.Provider
      value={{
        ...state,
        demo: !supabaseConfigured,
        isAdmin,
        unreadCount,
        guideStatus,
        closeGuide,
        refreshUnread,
        saveProfile,
        saveProperty,
        uploadImage,
        uploadAvatar,
        deleteProperty,
        refreshProperty,
        notify,
        signOut,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button onClick={() => setToast("")} aria-label="Închide notificarea">
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
