export const profileBioRoles = {
  agent: "Agent imobiliar",
  owner: "Proprietar",
} as const;

export type ProfileBioRole = keyof typeof profileBioRoles;

export function isProfileBioRole(value: unknown): value is ProfileBioRole {
  return typeof value === "string" && Object.hasOwn(profileBioRoles, value);
}

export const MAX_PROFILE_BIO_GENERATIONS = 3;
