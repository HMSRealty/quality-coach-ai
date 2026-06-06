"use client";

// Acquisition handoff brief — 3-bullet "classified intel dossier" card for the
// closer. Reads from lead.metadata fields the analyze route extracts.
import { ShieldAlert, User as UserIcon, Heart, DollarSign, FileWarning, Lock } from "lucide-react";
import { T } from "@/app/_components/tokens";

interface Props {
  personality?: string | null;
  painPoint?: string | null;
  bottomLine?: string | null;
}

export function HandoffBrief({ personality, painPoint, bottomLine }: Props) {
  if (!personality && !painPoint && !bottomLine) return null;
  return (
    <div style={{
      borderRadius: 18, padding: 22,
      background: "linear-gradient(135deg, #0B0F1F 0%, #1A2140 100%)",
      color: "#fff",
      border: "1px solid rgba(242,38,111,0.35)",
      boxShadow: "0 18px 44px rgba(11,15,31,0.45), 0 0 0 1px rgba(242,38,111,0.15) inset",
      position: "relative", overflow: "hidden",
    }}>
      {/* CLASSIFIED stripe */}
      <span style={{
        position: "absolute", top: 10, right: 10,
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 9px", borderRadius: 6,
        background: T.gradPrimary, color: "#fff",
        fontSize: 9, fontWeight: 900, letterSpacing: "0.16em",
      }}>
        <Lock size={9} /> ACQ EYES ONLY
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 10, background: T.gradPrimary,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 20px rgba(242,38,111,0.40)",
        }}>
          <ShieldAlert size={15} color="#fff" />
        </span>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Intel Dossier</p>
          <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>AI Handoff Brief</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Bullet icon={UserIcon} label="Seller personality" value={personality} accent="#F2266F" />
        <Bullet icon={Heart} label="Core pain point" value={painPoint} accent="#A78BFA" />
        <Bullet icon={DollarSign} label="Bottom-line price" value={bottomLine} accent="#10B981" />
      </div>

      <p style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: 10.5, color: "rgba(255,255,255,0.45)" }}>
        <FileWarning size={10} /> Generated from the call audio. Verify before negotiating.
      </p>
    </div>
  );
}

function Bullet({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value?: string | null; accent: string }) {
  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <Icon size={12} color={accent} />
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>{label}</span>
      </div>
      <p style={{ fontSize: 13.5, color: "#fff", fontWeight: 700, lineHeight: 1.4 }}>
        {value && value !== "None" ? value : <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>Not stated</span>}
      </p>
    </div>
  );
}
