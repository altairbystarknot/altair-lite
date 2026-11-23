"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** A link back to the sandbox this browser opened last, if any. */
export function Continue() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setId(localStorage.getItem("altair-lite:sandbox"));
    } catch {
      /* storage unavailable */
    }
  }, []);
  if (!id) return null;
  return <Link href={`/w/${id}`}>Continue your sandbox →</Link>;
}
