"use client";

// Real-time Notification Center — header bell with unread badge + FinTech popover.
// Driven by useRealtimeNotifications (Supabase Realtime). Clean Enterprise theme.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, MapPin, Flame, Sparkles } from "lucide-react";
import { useRealtimeNotifications } from "@/app/_components/useRealtimeNotifications";

const SKY_600 = "#2563EB";
const MONEY = "#2563EB";
const SPRING = { type: "spring", stiffness: 460, damping: 32, mass: 0.7 } as const;

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, open } = useRealtimeNotifications();
  const [openMenu, setOpenMenu] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenMenu(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [openMenu]);

  const toggle = () => {
    const next = !openMenu;
    setOpenMenu(next);
    if (next && unreadCount > 0) markAllRead(); // opening clears the badge
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button title="Notifications" onClick={toggle} style={{
        position: "relative", width: 36, height: 36, borderRadius: 10,
        background: openMenu ? "#0d1626" : "#fff", border: "1px solid var(--border-2)",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        color: openMenu ? SKY_600 : "#000", transition: "all 160ms ease",
      }}>
        <Bell size={16} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SPRING}
              style={{
                position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, padding: "0 4px",
                borderRadius: 999, background: "#DC2626", color: "#fff",
                fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid #fff", lineHeight: 1,
              }}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {openMenu && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={SPRING}
            style={{
              position: "absolute", right: 0, top: 46, zIndex: 100, width: 360, maxWidth: "90vw",
              background: "#0A0A0E", border: "1px solid var(--border-2)", borderRadius: 16,
              boxShadow: "0 24px 60px rgba(15,23,42,0.18)", overflow: "hidden",
            }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--border-1)" }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "#F4F4FF" }}>Notifications</p>
              {notifications.length > 0 && (
                <button onClick={markAllRead} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: SKY_600, fontSize: 12, fontWeight: 700 }}>
                  <Check size={13} /> Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div data-lenis-prevent="true" style={{ maxHeight: 380, overflowY: "auto", overscrollBehavior: "contain" }}>
              {notifications.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <Bell size={28} color="#33333f" style={{ margin: "0 auto 10px" }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#F4F4FF" }}>You&apos;re all caught up</p>
                  <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>New &amp; Hot leads will appear here instantly.</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const hot = n.kind === "hot";
                  const accent = hot ? MONEY : SKY_600;
                  return (
                    <button key={n.id} onClick={() => { open(n.leadId); setOpenMenu(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                        padding: "12px 16px", border: "none", borderBottom: "1px solid var(--border-1)",
                        borderLeft: `3px solid ${hot ? accent : "transparent"}`,
                        background: n.read ? "#fff" : hot ? "color-mix(in srgb, #2563EB 6%, #fff)" : "#0A0A0E",
                        cursor: "pointer",
                      }}>
                      <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>
                        {hot ? <Flame size={15} /> : <Sparkles size={15} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.03em", textTransform: "uppercase", color: hot ? accent : "var(--text-3)" }}>
                          {hot ? "🔥 Hot Lead" : "✨ New Lead"}
                        </p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: hot ? MONEY : "#000", display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                          <MapPin size={11} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.address}</span>
                        </p>
                      </div>
                      <span style={{ fontSize: 10.5, color: "var(--text-3)", flexShrink: 0 }}>{ago(n.at)}</span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
