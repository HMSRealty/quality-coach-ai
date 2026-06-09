"use client";

// Renders children into document.body so that position:fixed works correctly
// regardless of CSS transforms or overflow:hidden on ancestor containers.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    ref.current = el;
    setMounted(true);
    return () => { document.body.removeChild(el); };
  }, []);

  if (!mounted || !ref.current) return null;
  return createPortal(children, ref.current);
}
