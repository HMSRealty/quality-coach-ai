"use client";

// Real-time lead notifications via Supabase Realtime Channels.
// Subscribes to INSERT/UPDATE on `leads` for the signed-in user and emits:
//   • "✨ New Lead"  — a lead becomes decided (insert decided, or Processing→decided)
//   • "🔥 HOT LEAD"  — a lead's status is/now Hot (high priority)
// Fires a Sonner toast on every event and keeps an in-memory feed for the bell.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export type NotifKind = "new" | "hot";
export interface Notif {
  id: string;
  kind: NotifKind;
  leadId: string;
  address: string;
  at: number;
  read: boolean;
}

interface LeadRow {
  id: string;
  status: string | null;
  extracted_address: string | null;
  user_id: string;
}

const MAX = 40;

export function useRealtimeNotifications() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const seen = useRef<Set<string>>(new Set());          // dedup `${id}:${kind}`
  const unreadCount = notifications.reduce((n, x) => n + (x.read ? 0 : 1), 0);

  const open = useCallback((leadId: string) => {
    router.push(`/dashboard/leads/${leadId}`);
  }, [router]);

  const push = useCallback((kind: NotifKind, leadId: string, address: string) => {
    const key = `${leadId}:${kind}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);

    setNotifications((prev) => [
      { id: `${key}:${Date.now()}`, kind, leadId, address, at: Date.now(), read: false },
      ...prev,
    ].slice(0, MAX));

    // Sonner toast (branded, bottom-right). Tap to open the lead.
    const hot = kind === "hot";
    toast.custom(
      () => <ToastCard hot={hot} address={address} onClick={() => open(leadId)} />,
      { duration: hot ? 9000 : 5000 },
    );
  }, [open]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const ch = supabase
        .channel(`notif-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "leads", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const row = payload.new as LeadRow;
            const status = (row.status || "").toLowerCase();
            if (!status || status === "processing") return;
            const addr = row.extracted_address || "New property";
            if (status === "hot") push("hot", row.id, addr);
            else push("new", row.id, addr);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "leads", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const row = payload.new as LeadRow;
            const old = payload.old as Partial<LeadRow>;
            const status = (row.status || "").toLowerCase();
            const prev = (old.status || "").toLowerCase();
            const addr = row.extracted_address || "New property";
            // Newly turned Hot
            if (status === "hot" && prev !== "hot") { push("hot", row.id, addr); return; }
            // Just got decided (Processing → a real status)
            if (prev === "processing" && status && status !== "processing") push("new", row.id, addr);
          },
        )
        .subscribe();
      channel = ch;
    })();

    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [push]);

  const markAllRead = useCallback(() => setNotifications((p) => p.map((n) => ({ ...n, read: true }))), []);
  const clearAll = useCallback(() => setNotifications([]), []);

  return { notifications, unreadCount, markAllRead, clearAll, open };
}

// Branded toast card (rendered by Sonner). Kept here so the hook is self-contained.
function ToastCard({ hot, address, onClick }: { hot: boolean; address: string; onClick: () => void }) {
  const accent = hot ? "#2563EB" : "#2563EB";
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: 340, maxWidth: "86vw",
        padding: "13px 15px", borderRadius: 13, cursor: "pointer",
        background: "#FFFFFF", border: `1px solid ${hot ? "color-mix(in srgb, #2563EB 40%, transparent)" : "var(--border-2)"}`,
        borderLeft: `4px solid ${accent}`,
        boxShadow: "0 14px 40px rgba(15,23,42,0.16)",
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{hot ? "🔥" : "✨"}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: accent }}>
          {hot ? "Hot Lead" : "New Lead"}
        </p>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: "#15131D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {address}
        </p>
      </div>
    </div>
  );
}
