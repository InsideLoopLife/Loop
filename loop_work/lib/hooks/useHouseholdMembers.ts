// lib/hooks/useHouseholdMembers.ts
"use client";

import { useEffect, useState } from "react";

export interface HouseholdMember {
  id: string;
  displayName: string;
  relationship: string | null;
}

export function useHouseholdMembers() {
  const [members, setMembers] = useState<HouseholdMember[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/household/members")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setMembers(json.members ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { members, loading };
}
