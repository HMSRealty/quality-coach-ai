"use client";

// Gong-inspired dashboard chrome:
//   • Midnight-gradient sticky sidebar with magenta active indicator
//   • Glass topbar (backdrop-blur, floats over scrolling content)
//   • Lift/glow hover on every nav link
//   • Token-driven — flips with the dark toggle

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { impersonationTarget, stopImpersonation } from "@/lib/impersonation";
import { HelpButton } from "@/app/_components/HelpButton";
import { OmniSearch } from "@/app/_components/OmniSearch";
import { T } from "@/app/_components/tokens";
import {
  LayoutDashboard, PhoneCall, FolderCog, Zap,
  UserCircle, LogOut, Bell, ChevronRight, Shield,
  Send, Users2, Briefcase, Network,
  Headphones, Flag, Power, UserCog, Eye, Search,
  Settings as SettingsIcon, Webhook, Wallet, Target, ListChecks, Trophy,
} from "lucide-react";

// Grouped enterprise navigation — Main · Execution & QA · HR & Operations · Admin.
const NAV_GROUPS: { section: string; items: { label: string; href: string; icon: typeof PhoneCall }[] }[] = [
  {
    section: "Main",
    items: [
      { label: "The Matrix",   href: "/dashboard/matrix",      icon: Network },
      { label: "Overview",     href: "/dashboard",             icon: LayoutDashboard },
      { label: "Leads",        href: "/dashboard/calls",       icon: ListChecks },
      { label: "Submit Lead",  href: "/dashboard/submit-lead", icon: Send },
    ],
  },
  {
    section: "Execution & QA",
    items: [
      { label: "Call Library",       href: "/dashboard/calls",      icon: PhoneCall },
      { label: "AI Rules & Persona", href: "/dashboard/persona",    icon: Zap },
      { label: "Campaigns",          href: "/dashboard/campaigns",  icon: FolderCog },
      { label: "Roleplay Dialer",    href: "/dashboard/dialer",     icon: Headphones },
    ],
  },
  {
    section: "HR & Operations",
    items: [
      { label: "Floor Agents",   href: "/dashboard/callers",      icon: Users2 },
      { label: "Teams",          href: "/dashboard/teams",        icon: Network },
      { label: "Trainers",       href: "/dashboard/trainers",     icon: Briefcase },
      { label: "Team Leader",    href: "/dashboard/team-leader",  icon: Flag },
      { label: "Shift Targets",  href: "/dashboard/settings",     icon: Target },
      { label: "Payroll & Bonus",href: "/dashboard/payroll",      icon: Wallet },
      { label: "Leaderboard",    href: "/dashboard/leaderboard",  icon: Trophy },
    ],
  },
  {
    section: "Admin",
    items: [
      { label: "Settings",                href: "/dashboard/settings",    icon: SettingsIcon },
      { label: "Webhooks & Integrations", href: "/dashboard/settings",    icon: Webhook },
      { label: "Sub-Users",               href: "/dashboard/sub-users",   icon: UserCog },
      { label: "Permissions",             href: "/dashboard/permissions", icon: Power },
      { label: "RBAC Matrix",             href: "/dashboard/roles",       icon: Shield },
    ],
  },
];
const NAV_SECONDARY = [
  { label: "Profile",  href: "/dashboard/profile",  icon: UserCircle },
];

const PLAN_ACCENT: Record<string, string> = {
  free: "#94A3B8", starter: "#34D399", professional: "#F2266F", enterprise: "#A78BFA",
};

// Original RealTrack mark — pyramid outline + wordmark (kept by user request).
function RealTrackMark({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width={size * 1.3} height={size * 0.85} viewBox="0 0 40 24" fill="none">
        <path d="M2 22 L20 4 L38 22" stroke="#0EA5E9" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 22 L20 11 L32 22" stroke="rgba(14,165,233,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)", letterSpacing: "0.04em", lineHeight: 1 }}>RealTrack</span>
        <span style={{ fontSize: 9, color: "var(--text-3)", letterSpacing: "0.12em", fontWeight: 600, marginTop: 3 }}>PERFORMANCE SUITE</span>
      </span>
    </div>
  );
}

function NavLink({ item, active }: { item: { label: string; href: string; icon: typeof PhoneCall }; active: boolean }) {
  const Icon = item.icon;
  const [hover, setHover] = useState(false);
  const SKY = "#0284C7"; // sky-600 for active text/icon on the white sidebar
  return (
    <Link href={item.href}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 11,
        padding: "9px 13px", borderRadius: 10,
        textDecoration: "none",
        background: active ? "rgba(14, 165, 233, 0.10)" : hover ? "var(--surface-3)" : "transparent",
        color: active ? SKY : hover ? "var(--text-1)" : "var(--text-2)",
        fontSize: 13, fontWeight: active ? 700 : 500,
        transform: hover && !active ? "translateX(2px)" : "translateX(0)",
        transition: "all 180ms cubic-bezier(0.16, 1, 0.30, 1)",
        boxShadow: active ? "inset 0 0 0 1px rgba(14,165,233,0.28)" : "none",
      }}
    >
      {active && (
        <span style={{
          position: "absolute", left: -10, top: "50%", transform: "translateY(-50%)",
          width: 3, height: 20, borderRadius: 4,
          background: "linear-gradient(180deg, #38BDF8, #0284C7)",
          boxShadow: "0 0 14px rgba(14,165,233,0.5)",
        }} />
      )}
      <Icon size={16} strokeWidth={active ? 2.3 : 1.9}
        color={active ? SKY : hover ? "var(--text-1)" : "var(--text-3)"}
        style={{ transition: "transform 240ms var(--spring-snap)", transform: hover ? "translateY(-1px)" : "translateY(0)" }} />
      {item.label}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
      color: "var(--text-4)", textTransform: "uppercase",
      padding: "0 14px", marginBottom: 8,
    }}>{children}</p>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [email, setEmail]     = useState("");
  const [fullName, setFullName] = useState("");
  const [plan, setPlan]       = useState("free");
  const [initials, setInit]   = useState("?");
  const [isAdmin, setIsAdmin] = useState(false);
  const [actingAs, setActingAs] = useState<string | null>(null);

  useEffect(() => {
    setActingAs(impersonationTarget());
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/"; return; }
      const e = user.email ?? "";
      setEmail(e); setInit(e.slice(0, 2).toUpperCase());
      const { data } = await supabase.from("profiles").select("plan_tier,role,full_name").eq("id", user.id).maybeSingle();
      if (data) {
        setPlan(data.plan_tier ?? "free");
        setIsAdmin(data.role === "admin");
        if (data.full_name) setFullName(data.full_name as string);
      }
    })();
  }, []);

  const logout = async () => { await supabase.auth.signOut(); window.location.href = "/"; };
  const planAccent = PLAN_ACCENT[plan] ?? "#94A3B8";
  const displayName = fullName || email;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--canvas)" }}>

      {/* ───────── SIDEBAR — midnight gradient, magenta indicators ───────── */}
      <aside data-lenis-prevent="true" style={{
        width: 256, flexShrink: 0,
        background: T.gradChrome,
        borderRight: `1px solid ${T.midnightLine}`,
        display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, bottom: 0,
        zIndex: 40, overflowY: "auto", overscrollBehavior: "contain",
        boxShadow: "var(--shadow-md)",
        color: "var(--text-1)",
      }}>
        <Link href="/dashboard"
          style={{
            padding: "22px 18px 18px", borderBottom: `1px solid ${T.midnightLine}`,
            display: "flex", alignItems: "center", gap: 12, textDecoration: "none",
          }}>
          <RealTrackMark size={28} />
        </Link>

        {/* Grouped nav. Each href highlights only on its FIRST occurrence so
            shared routes (e.g. Settings) don't light up multiple rows. */}
        {(() => {
          const seen = new Set<string>();
          return NAV_GROUPS.map((group, gi) => (
            <div key={group.section} style={{ padding: gi === 0 ? "16px 8px 4px" : "4px 8px" }}>
              <SectionLabel>{group.section}</SectionLabel>
              <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
                {group.items.map((item) => {
                  const isActive = pathname === item.href && !seen.has(item.href);
                  if (pathname === item.href) seen.add(item.href);
                  return <NavLink key={item.label} item={item} active={isActive} />;
                })}
              </nav>
            </div>
          ));
        })()}

        <div style={{ height: 1, background: T.midnightLine, margin: "10px 22px" }} />

        <div style={{ padding: "0 16px 10px" }}>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV_SECONDARY.map(item => <NavLink key={item.href} item={item} active={pathname === item.href} />)}
            {isAdmin && (
              <Link href="/admin" style={{
                display: "flex", alignItems: "center", gap: 11,
                padding: "9px 13px", borderRadius: 10, textDecoration: "none",
                color: "var(--text-2)",
                fontSize: 13, fontWeight: 500, marginTop: 2,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "var(--text-1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-2)"; }}
              >
                <Shield size={16} strokeWidth={1.9} /> Admin Portal
              </Link>
            )}
          </nav>
        </div>

        <div style={{ flex: 1 }} />

        {/* Upgrade card */}
        {plan === "free" && (
          <div style={{ padding: "0 14px 12px" }}>
            <Link href="/landing#pricing" style={{
              display: "block", padding: "14px 16px", borderRadius: 16,
              background: T.gradPrimary, color: "#fff",
              textDecoration: "none",
              boxShadow: "var(--shadow-brand)",
              transition: "transform 220ms var(--spring-snap)",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <p style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Upgrade your plan</p>
              <p style={{ fontSize: 11, opacity: 0.85, display: "flex", alignItems: "center", gap: 3 }}>
                Unlock unlimited analyses <ChevronRight size={11} />
              </p>
            </Link>
          </div>
        )}

        {/* User card */}
        <div style={{ padding: "12px 14px 18px", borderTop: `1px solid ${T.midnightLine}` }}>
          <Link href="/dashboard/profile" style={{
            display: "flex", alignItems: "center", gap: 11,
            padding: "10px 12px", borderRadius: 12, textDecoration: "none",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--surface-3)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: T.gradPrimary, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800,
            }}>{initials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {displayName || "Loading…"}
              </p>
              <p style={{ fontSize: 10, color: planAccent, fontWeight: 700, textTransform: "capitalize", marginTop: 1 }}>
                ● {plan} plan
              </p>
            </div>
          </Link>
          <button onClick={logout} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderRadius: 10, width: "100%",
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 12, color: "var(--text-2)", marginTop: 4,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "var(--text-1)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-2)"; }}
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      {/* ───────── MAIN ───────── */}
      <div style={{ marginLeft: 256, flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

        {actingAs && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
            padding: "10px 16px",
            background: T.gradPrimary, color: "#fff",
            fontSize: 13, fontWeight: 700, position: "sticky", top: 0, zIndex: 50,
            boxShadow: "0 4px 18px rgba(242,38,111,0.35)",
          }}>
            <Eye size={14} /> You are acting as <strong>{actingAs}</strong>
            <button onClick={() => stopImpersonation()} style={{
              padding: "5px 14px", borderRadius: 999, border: "none", cursor: "pointer",
              background: "rgba(255,255,255,0.18)", color: "#fff", fontSize: 12, fontWeight: 700,
              backdropFilter: "blur(10px)",
            }}>
              Exit impersonation
            </button>
          </div>
        )}

        {/* Glass topbar */}
        <header
          className="glass"
          style={{
            height: 62,
            display: "flex", alignItems: "center", padding: "0 28px", gap: 12,
            position: "sticky", top: 0, zIndex: 30,
            background: "color-mix(in srgb, var(--canvas) 70%, transparent)",
          }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ color: "var(--text-3)" }}>Workspace</span>
            <ChevronRight size={13} color="var(--text-3)" />
            <span style={{ fontWeight: 700, color: "var(--text-1)", textTransform: "capitalize" }}>
              {pathname.split("/").pop()?.replace(/-/g, " ") || "overview"}
            </span>
          </div>
          {/* Cmd+K search trigger (also opens via global keyboard shortcut) */}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }))}
            title="Search · ⌘K"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "7px 10px 7px 12px", height: 36, borderRadius: 999,
              background: "var(--surface-1)", border: "1px solid var(--border-2)",
              color: "var(--text-2)", cursor: "pointer",
              fontSize: 12, fontWeight: 600,
              transition: "all 180ms var(--spring-heavy)",
              marginRight: 4,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-3)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <Search size={13} /> Search
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 2,
              padding: "1px 6px", borderRadius: 6,
              background: "var(--surface-3)", color: "var(--text-3)",
              fontSize: 10, fontWeight: 800, letterSpacing: "0.02em",
            }}>⌘K</span>
          </button>
          <HelpButton />
          <button title="Notifications" style={{
            width: 36, height: 36, borderRadius: 10,
            background: "var(--surface-1)", border: "1px solid var(--border-2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "var(--slate)",
            transition: "all 180ms var(--spring-heavy)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "var(--text-1)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; e.currentTarget.style.color = "var(--slate)"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <Bell size={15} />
          </button>
          <Link href="/dashboard/profile" style={{
            width: 36, height: 36, borderRadius: "50%",
            background: T.gradPrimary, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 800,
            boxShadow: "0 4px 14px rgba(242,38,111,0.32)",
            transition: "transform 220ms var(--spring-snap)",
          }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
          >{initials}</Link>
        </header>

        {/* No internal overflow — let the window scroll so Lenis applies smoothly */}
        <main style={{ flex: 1, padding: "30px 36px 60px" }}>
          {children}
        </main>
      </div>
      <OmniSearch />
    </div>
  );
}
