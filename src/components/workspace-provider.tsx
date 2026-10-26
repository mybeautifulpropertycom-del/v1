"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, X } from "lucide-react";
import type { Profile, Property, Workspace } from "@/lib/model";
import { propertyErrors, publicationErrors, slugify } from "@/lib/model";
import { readDemo, writeDemo } from "@/lib/demo-storage";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";

type WorkspaceContext = Workspace & {
  demo: boolean;
  isAdmin: boolean;
  saveProfile: (profile: Profile) => Promise<void>;
  saveProperty: (property: Property, publish?: boolean) => Promise<Property>;
  uploadImage: (file: File, propertyId: string) => Promise<string>;
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
    throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Each image can be up to 10 MB.");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not process the image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The image could not be processed.")),
      "image/webp",
      0.86,
    ),
  );
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<Workspace | null>(null);
  const stateRef = useRef<Workspace | null>(null);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
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
          router.replace("/login");
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
            "We could not load your workspace. Check your Supabase migration and connection.",
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
            e instanceof Error ? e.message : "The connection is unavailable.",
          );
      }
    }
    void load();
    const subscription = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
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
          "Your property could not be refreshed. Please reload the page.",
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
    const current = stateRef.current!;
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase
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
        .select("id")
        .single();
      if (error)
        throw new Error(
          "Your profile was not saved. Check your connection and try again.",
        );
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
      const { error } = await supabase
        .from("properties")
        .upsert(nextProperty)
        .select("id")
        .single();
      if (error)
        throw new Error(
          error.code === "P0402"
            ? "Complete the $97 payment in Website design before publishing this property."
            : "Your property was not saved. Check the details and your connection, then try again.",
        );
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

  async function uploadImage(file: File, propertyId: string) {
    const blob = await optimizeImage(file);
    const supabase = getSupabase();
    if (!supabase)
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () =>
          reject(new Error("We could not read this image."));
        reader.readAsDataURL(blob);
      });
    const path = `${stateRef.current!.profile.id}/${propertyId}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage
      .from("property-images")
      .upload(path, blob, { contentType: "image/webp", upsert: false });
    if (error)
      throw new Error(
        "Your image could not be uploaded. Check the property-images bucket and connection.",
      );
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
          reject(new Error("The photo could not be read."));
        reader.readAsDataURL(blob);
      });
    const path = `${stateRef.current!.profile.id}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage
      .from("agent-avatars")
      .upload(path, blob, { contentType: "image/webp", upsert: false });
    if (error)
      throw new Error(
        "Your profile photo could not be uploaded. Check that profile photo storage has been set up, then try again.",
      );
    return supabase.storage.from("agent-avatars").getPublicUrl(path).data
      .publicUrl;
  }

  async function deleteProperty(property: Property) {
    const owner = stateRef.current!.profile.id;
    if (property.owner_id !== owner)
      throw new Error("This property is not in your workspace.");
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase.rpc("delete_owned_property", {
        property_id: property.id,
      });
      if (error || data !== true)
        throw new Error(
          "Your property could not be deleted. Check the account tools database update and your connection, then try again.",
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
      "Property deleted. Its public page is no longer available. Your leads remain in your inbox.",
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
              "Property deleted. Some saved photos could not be removed from storage.",
            );
        } catch {
          notify(
            "Property deleted. Some saved photos could not be removed from storage.",
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
        notify("Sign out failed. Please try again.");
        return;
      }
    }
    router.push("/login");
  }

  if (error)
    return (
      <div className="state-screen">
        <div className="brand-symbol">m.</div>
        <h1>Let’s get you reconnected.</h1>
        <p>{error}</p>
        <button className="button primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!state)
    return (
      <div className="state-screen">
        <div className="brand-symbol">m.</div>
        <LoaderCircle className="spin" />
        <p>Getting your workspace ready…</p>
      </div>
    );
  return (
    <Context.Provider
      value={{
        ...state,
        demo: !supabaseConfigured,
        isAdmin,
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
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
