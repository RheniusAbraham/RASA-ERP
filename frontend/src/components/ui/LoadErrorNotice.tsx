"use client";

import { AlertCircle } from "lucide-react";
import { useData } from "@/lib/store";

/** Shown when the backend couldn't be reached, so an empty list isn't mistaken for "no data". */
export default function LoadErrorNotice() {
  const { loadError } = useData();
  if (!loadError) return null;
  return (
    <p className="load-error" role="alert">
      <AlertCircle size={16} strokeWidth={1.75} /> {loadError}
    </p>
  );
}
