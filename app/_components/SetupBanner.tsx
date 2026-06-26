"use client";

// A small banner at the top of /dashboard that disappears once the user
// has completed setup. While it's there it shows progress and links to the
// next step. Removes itself permanently once everything's done.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Rocket, X, CheckCircle2, ArrowRight } from "lucide-react";

const STORAGE_KEY = "realtrack_setup_banner_dismissed";

interface Status {
  gemini: boolean;
  dialer: boolean;
  campaign: boolean;
}

export function SetupBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(STORAGE_KEY) === "1") setDismissed(true); } catch {}
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [gemini, dialer, campaign] = await Promise.all([
        supabase.from("gemini_api_keys").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true),
        supabase.from("readymode_connections").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true),
        supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true),
      ]);
      setStatus({
        gemini: (gemini.count || 0) > 0,
        dialer: (dialer.count || 0) > 0,
        campaign: (campaign.count || 0) > 0,
      });
    })();
  }, []);

  if (!status || dismissed) return null;

  // The dialer step is optional — the banner closes once Gemini + a campaign are set.
  const required = [status.gemini, status.campaign];
  const done = required.filter(Boolean).length;
  if (done === required.length) return null;

  const next = !status.gemini
    ? { label: "Add a Gemini API key", href: "/dashboard/settings/api" }
    : !status.campaign
    ? { label: "Create your first campaign", href: "/dashboard/campaigns" }
    : null;

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(59,130,246,0.10), #DBEAFE)",
      border: "1px solid #BFDBFE",
      borderRadius: 14, padding: "14px 18px",
      display: "flex", alignItems: "center", gap: 14,
      marginBottom: 16,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: "linear-gradient(135deg, #3B82F6, #2563EB)", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Rocket size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: "#F4F4FF" }}>
          Almost ready — {done} of {required.length} steps done
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: status.gemini ? "#2563EB" : "#26262F", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <CheckCircle2 size={11} color={status.gemini ? "#2563EB" : "#33333f"} /> Gemini key
          </span>
          <span style={{ fontSize: 11.5, color: status.campaign ? "#2563EB" : "#26262F", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <CheckCircle2 size={11} color={status.campaign ? "#2563EB" : "#33333f"} /> First campaign
          </span>
          <span style={{ fontSize: 11.5, color: "#94A3B8", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <CheckCircle2 size={11} color={status.dialer ? "#2563EB" : "#33333f"} /> Dialer <span style={{ opacity: 0.7 }}>(optional)</span>
          </span>
        </div>
      </div>
      {next && (
        <Link href={next.href} style={{
          padding: "9px 16px", borderRadius: 9,
          background: "linear-gradient(135deg, #3B82F6, #2563EB)", color: "#fff",
          fontSize: 12.5, fontWeight: 800, textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 5,
          whiteSpace: "nowrap",
        }}>
          {next.label} <ArrowRight size={12} />
        </Link>
      )}
      <button
        onClick={() => {
          try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
          setDismissed(true);
        }}
        title="Dismiss"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9A9AB0" }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
