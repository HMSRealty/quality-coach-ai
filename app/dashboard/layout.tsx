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
import { ThemeToggle } from "@/app/_components/ThemeToggle";
import { HelpButton } from "@/app/_components/HelpButton";
import { T } from "@/app/_components/tokens";
import {
  LayoutDashboard, PhoneCall, FolderCog, Zap,
  UserCircle, LogOut, Bell, ChevronRight, Shield,
  BarChart3, Send, Users2, Briefcase, TrendingUp,
  Headphones, Flag, Power, UserCog, Eye, Columns3,
} from "lucide-react";

const NAV_PRIMARY = [
  { label: "Overview",     href: "/dashboard",           icon: LayoutDashboard },
  { label: "Pipeline",     href: "/dashboard/pipeline",  icon: Columns3 },
  { label: "Analytics",    href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Call Library", href: "/dashboard/calls",     icon: PhoneCall },
  { label: "Campaigns",    href: "/dashboard/campaigns", icon: FolderCog },
];
const NAV_TEAM = [
  { label: "Submit Lead",   href: "/dashboard/submit-lead",     icon: Send },
  { label: "Teams",         href: "/dashboard/teams",           icon: Users2 },
  { label: "Callers",       href: "/dashboard/callers",         icon: Users2 },
  { label: "Trainers",      href: "/dashboard/trainers",        icon: Briefcase },
  { label: "Roleplay Dialer", href: "/dashboard/dialer",        icon: Headphones },
  { label: "Team Leader",   href: "/dashboard/team-leader",     icon: Flag },
  { label: "Leaderboard",   href: "/dashboard/leaderboard",     icon: TrendingUp },
  { label: "AI Persona",    href: "/dashboard/persona",         icon: Zap },
  { label: "Permissions",   href: "/dashboard/permissions",     icon: Power },
  { label: "Roles & Access",href: "/dashboard/roles",           icon: Shield },
  { label: "Sub-Users",     href: "/dashboard/sub-users",       icon: UserCog },
];
const NAV_SECONDARY = [
  { label: "Profile",  href: "/dashboard/profile",  icon: UserCircle },
  { label: "Settings", href: "/dashboard/settings", icon: BarChart3 },
];

const PLAN_ACCENT: Record<string, string> = {
  free: "#94A3B8", starter: "#34D399", professional: "#F2266F", enterprise: "#A78BFA",
};

function RealTrackMark({ size = 26 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{
        width: size + 2, height: size + 2, borderRadius: 10,
        background: T.gradPrimary, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 8px 22px rgba(242,38,111,0.35)",
      }}>
        <svg width={size * 0.66} height={size * 0.45} viewBox="0 0 40 24" fill="none">
          <path d="M2 22 L20 4 L38 22" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M8 22 L20 11 L32 22" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "0.04em" }}>RealTrack</span>
    </div>
  );
}

function NavLink({ item, active }: { item: typeof NAV_PRIMARY[0]; active: boolean }) {
  const Icon = item.icon;
  const [hover, setHover] = useState(false);
  return (
    <Link href={item.href}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 11,
        padding: "10px 14px", borderRadius: 12,
        textDecoration: "none",
        background: active ? "rgba(242, 38, 111, 0.10)" : hover ? "rgba(255,255,255,0.05)" : "transparent",
        color: active ? "#fff" : hover ? "#fff" : "rgba(255,255,255,0.72)",
        fontSize: 13, fontWeight: active ? 700 : 500,
        transform: hover && !active ? "translateX(2px)" : "translateX(0)",
        transition: "all 180ms cubic-bezier(0.16, 1, 0.30, 1)",
      }}
    >
      {active && (
        <span style={{
          position: "absolute", left: -10, top: "50%", transform: "translateY(-50%)",
          width: 3, height: 22, borderRadius: 4,
          background: T.gradPrimary,
          boxShadow: `0 0 18px ${T.magentaGlow}`,
        }} />
      )}
      <Icon size={16} strokeWidth={active ? 2.4 : 1.9}
        color={active ? "#fff" : hover ? "#fff" : "rgba(255,255,255,0.65)"}
        style={{ transition: "transform 240ms var(--spring-snap)", transform: hover ? "translateY(-1px)" : "translateY(0)" }} />
      {item.label}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
      color: "rgba(255,255,255,0.40)", textTransform: "uppercase",
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
      <aside style={{
        width: 256, flexShrink: 0,
        background: T.gradChrome,
        borderRight: `1px solid ${T.midnightLine}`,
        display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, bottom: 0,
        zIndex: 40, overflowY: "auto",
        boxShadow: "var(--shadow-chrome)",
        color: "#fff",
      }}>
        <Link href="/dashboard"
          style={{
            padding: "22px 18px 18px", borderBottom: `1px solid ${T.midnightLine}`,
            display: "flex", alignItems: "center", gap: 12, textDecoration: "none",
          }}>
          <RealTrackMark size={28} />
        </Link>

        <div style={{ padding: "16px 8px 8px" }}>
          <SectionLabel>Workspace</SectionLabel>
          <nav style={{ display: "flex", flexDirection: "column", gap: 3, padding: "0 8px" }}>
            {NAV_PRIMARY.map(item => <NavLink key={item.href} item={item} active={pathname === item.href} />)}
          </nav>
        </div>

        <div style={{ height: 1, background: T.midnightLine, margin: "12px 22px" }} />

        <div style={{ padding: "8px 8px" }}>
          <SectionLabel>Team Management</SectionLabel>
          <nav style={{ display: "flex", flexDirection: "column", gap: 3, padding: "0 8px" }}>
            {NAV_TEAM.map(item => <NavLink key={item.href} item={item} active={pathname === item.href} />)}
          </nav>
        </div>

        <div style={{ height: 1, background: T.midnightLine, margin: "12px 22px" }} />

        <div style={{ padding: "0 16px 10px" }}>
          <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {NAV_SECONDARY.map(item => <NavLink key={item.href} item={item} active={pathname === item.href} />)}
            {isAdmin && (
              <Link href="/admin" style={{
                display: "flex", alignItems: "center", gap: 11,
                padding: "10px 14px", borderRadius: 12, textDecoration: "none",
                color: "rgba(255,255,255,0.72)",
                fontSize: 13, fontWeight: 600, marginTop: 2,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.72)"; }}
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
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: T.gradPrimary, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800,
            }}>{initials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
            fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
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
          <ThemeToggle />
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

        <main style={{ flex: 1, padding: "30px 36px 60px", overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
