"use client";

// Always-visible floating "?" button on every dashboard page. Click to open
// a small menu with the three things 90% of users need: the setup wizard,
// the tutorial, and email support. No more dropdowns, no more digging.

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { HelpCircle, Rocket, BookOpen, Mail, X } from "lucide-react";

export function QuickHelp() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const item: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 11,
    padding: "11px 14px", borderRadius: 10,
    color: "#F4F4FF", textDecoration: "none",
    fontSize: 13.5, fontWeight: 600,
    transition: "background 120ms ease",
  };

  return (
    <div ref={ref} style={{ position: "fixed", left: 20, bottom: 20, zIndex: 9998 }}>
      {open && (
        <div style={{
          marginBottom: 10,
          background: "#0A0A0E", borderRadius: 14,
          boxShadow: "0 20px 50px rgba(15,23,42,0.18), 0 4px 12px rgba(15,23,42,0.06)",
          border: "1px solid #22222c",
          padding: 8, minWidth: 240,
          animation: "fadeIn 150ms ease",
        }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.08em", padding: "8px 12px 4px", textTransform: "uppercase" }}>Need a hand?</p>
          <Link href="/dashboard/onboarding" onClick={() => setOpen(false)} style={item}
            onMouseEnter={(e) => e.currentTarget.style.background = "#101018"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            <Rocket size={15} color="#2563EB" /> Setup wizard
          </Link>
          <a href="https://realtrack.app/tutorial" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={item}
            onMouseEnter={(e) => e.currentTarget.style.background = "#101018"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            <BookOpen size={15} color="#2563EB" /> Step-by-step guide
          </a>
          <a href="mailto:info@realtrack.app" onClick={() => setOpen(false)} style={item}
            onMouseEnter={(e) => e.currentTarget.style.background = "#101018"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            <Mail size={15} color="#2563EB" /> Email us
          </a>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Help"
        style={{
          width: 46, height: 46, borderRadius: "50%", border: "none",
          background: open ? "#0A0A0E" : "linear-gradient(135deg, #3B82F6, #2563EB)",
          color: "#fff", cursor: "pointer",
          boxShadow: "0 10px 28px rgba(10,95,82,0.40)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 180ms ease",
        }}
      >
        {open ? <X size={20} /> : <HelpCircle size={22} />}
      </button>
    </div>
  );
}
