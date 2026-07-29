export type IdentityProfileSummary = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  householdId: string | null;
};

export * from "./repositories/profile-avatar.repository";
