"use client";
import { useState } from "react";
import type { PublicProfile } from "@/lib/model";

/** The same saved portrait is used throughout the workspace and public sites. */
export function AgentAvatar({
  profile,
}: {
  profile: Pick<PublicProfile, "name" | "avatar_url">;
}) {
  const [failed, setFailed] = useState("");
  const url = profile.avatar_url || "";
  const allowed =
    /^https:\/\//i.test(url) ||
    /^data:image\/(webp|png|jpeg);base64,/i.test(url);
  if (allowed && url !== failed)
    return (
      <img
        className="agent-avatar-image"
        src={url}
        alt={`${profile.name || "Your agent"} — profile photo`}
        onError={() => setFailed(url)}
      />
    );
  return (
    <>
      {profile.name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join("") || "YOU"}
    </>
  );
}
