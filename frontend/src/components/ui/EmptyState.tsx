"use client";

import { useData } from "@/lib/store";

/** "No X added yet." once the data has loaded; "Loading…" before that, so lists don't flash empty. */
export default function EmptyState({ children }: { children: React.ReactNode }) {
  const { loaded } = useData();
  return <p className="empty-state">{loaded ? children : "Loading…"}</p>;
}
