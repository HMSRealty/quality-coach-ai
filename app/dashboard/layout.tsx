"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { impersonationTarget, stopImpersonation } from "@/lib/impersonation";
import { ThemeToggle } from "@/app/_components/ThemeToggle";
import {
  LayoutDashboard, PhoneCall, FolderCog, Zap,
  UserCircle, LogOut, Bell, ChevronRight, Shield,
  BarChart3, Send, Users2, Briefcase, TrendingUp,
  Headphones, Flag, Power, UserCog, Eye,
} from "lucide-react";

const NAVY = "#232B3A";
const TEAL = "#2F6BFF";
const RED = NAVY;

const NAV_PRIMARY = [
  { label: "Overview",     href: "/dashboard",           icon: LayoutDashboard },
  { label: "Call Library", href: "/dashboard/calls",     icon: PhoneCall },
  { label: "Campaigns",    href: "/dashboard/campaigns", icon: FolderCog },
];
const NAV_TEAM = [
  { label: "Submit Lead",  href: "/dashboard/submit-lead",    icon: Send },
  { label: "Callers",      href: "/dashboard/callers",        icon: Users2 },
  { label: "Trainers",     href: "/dashboard/trainers",       icon: Briefcase },
  { label: "Roleplay Dialer", href: "/dashboard/dialer",      icon: Headphones },
  { label: "Team Leader",  href: "/dashboard/team-leader",    icon: BarChart3 },
  { label: "Performance",  href: "/dashboard/team-performance", icon: TrendingUp },
  { label: "Permissions",  href: "/dashboard/permissions",    icon: Power },
  { label: "Sub-Users",    href: "/dashboard/sub-users",      icon: UserCog },
];
const NAV_SECONDARY = [
  { label: "Profile",          href: "/dashboard/profile",        icon: UserCircle },
  { label: "Settings",         href: "/dashboard/settings",       icon: BarChart3 },
];

const PLAN_COLORS: Record<string, string> = {
  free: "#64748B", starter: "#059669", professional: RED, enterprise: "#7C3AED",
};

function HMSIcon({ size = 26 }: { size?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
      <svg width={size} height={size * 0.62} viewBox="0 0 40 24" fill="none">
        {/* Modern geometric roof */}
        <path d="M2 22 L20 4 L38 22" stroke={NAVY} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M8 22 L20 11 L32 22" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9"/>
      </svg>
      <span style={{ fontSize: size * 0.28, fontWeight: 800, letterSpacing: "0.14em", color: NAVY, lineHeight: 1, marginTop: 3 }}>
        REALTRACK
      </span>
    </div>
  );
}
const HSMIcon = HMSIcon;

function NavLink({ item, active }: { item: typeof NAV_PRIMARY[0]; active: boolean }) {
  const Icon = item.icon;
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={item.href} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 12px", borderRadius: 10,
      textDecoration: "none",
      background: active ? "#EEF1F6" : hovered ? "#F4EFE7" : "transparent",
      color: active ? RED : hovered ? "#232B3A" : "#4B5563",
      fontSize: 13, fontWeight: active ? 700 : 400,
      transition: "all 120ms ease",
      position: "relative",
    }}
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
    >
      {active && (
        <span style={{
          position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
          width: 3, height: 18, background: RED, borderRadius: "0 2px 2px 0",
        }} />
      )}
      <Icon size={15} color={active ? RED : hovered ? "#232B3A" : "#64748B"} strokeWidth={active ? 2.2 : 1.8} />
      {item.label}
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const [email, setEmail]     = useState("");
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
      setEmail(e);
      setInit(e.slice(0, 2).toUpperCase());
      const { data } = await supabase.from("profiles").select("plan_tier,role").eq("id", user.id).single();
      if (data) { setPlan(data.plan_tier ?? "free"); setIsAdmin(data.role === "admin"); }
    })();
  }, []);

  const logout = async () => { await supabase.auth.signOut(); window.location.href = "/"; };
  const planColor = PLAN_COLORS[plan] ?? "#64748B";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--canvas)" }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 240, flexShrink: 0,
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-2)",
        display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, bottom: 0,
        zIndex: 40, overflowY: "auto",
        boxShadow: "1px 0 0 #F3F4F6",
      }}>

        {/* Logo */}
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: 12 }}>
          <HSMIcon size={28} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, lineHeight: 1 }}>RealTrack</p>
            <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 2, fontWeight: 500 }}>Performance Suite</p>
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: "14px 10px 8px" }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", color: "#94A3B8", textTransform: "uppercase", padding: "0 10px", marginBottom: 6 }}>
            Workspace
          </p>
          <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {NAV_PRIMARY.map(item => <NavLink key={item.href} item={item} active={pathname === item.href} />)}
          </nav>
        </div>

        <div style={{ height: 1, background: "#F3F4F6", margin: "8px 18px" }} />

        <div style={{ padding: "14px 10px 8px" }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", color: "#94A3B8", textTransform: "uppercase", padding: "0 10px", marginBottom: 6 }}>
            Team Management
          </p>
          <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {NAV_TEAM.map(item => <NavLink key={item.href} item={item} active={pathname === item.href} />)}
          </nav>
        </div>

        <div style={{ height: 1, background: "#F3F4F6", margin: "8px 18px" }} />

        <div style={{ padding: "0 10px 8px" }}>
          <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {NAV_SECONDARY.map(item => <NavLink key={item.href} item={item} active={pathname === item.href} />)}
            {isAdmin && (
              <Link href="/admin" style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10, textDecoration: "none",
                color: RED, fontSize: 13, fontWeight: 600,
                transition: "background 120ms",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#EEF1F6"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Shield size={15} color={RED} strokeWidth={1.8} />
                Admin Portal
              </Link>
            )}
          </nav>
        </div>

        <div style={{ flex: 1 }} />

        {/* Upgrade nudge */}
        {plan === "free" && (
          <div style={{ padding: "0 12px 10px" }}>
            <Link href="/landing#pricing" style={{
              display: "block", padding: "10px 12px", borderRadius: 10,
              background: "#EEF1F6", border: `1px solid #D8DEE9`,
              textDecoration: "none",
              transition: "background 120ms",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#D8DEE9"}
            onMouseLeave={e => e.currentTarget.style.background = "#EEF1F6"}
            >
              <p style={{ fontSize: 11, fontWeight: 700, color: RED, marginBottom: 2 }}>Upgrade your plan</p>
              <p style={{ fontSize: 10, color: "#94A3B8", display: "flex", alignItems: "center", gap: 3 }}>
                Unlock more analyses <ChevronRight size={9} />
              </p>
            </Link>
          </div>
        )}

        {/* User */}
        <div style={{ padding: "10px 10px 16px", borderTop: "1px solid #F3F4F6" }}>
          <Link href="/dashboard/profile" style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: "8px 10px", borderRadius: 10, textDecoration: "none",
            transition: "background 120ms",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#F4EFE7"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              background: "#EEF1F6", border: `2px solid #D8DEE9`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 800, color: RED,
            }}>{initials}</div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#232B3A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {email || "Loading..."}
              </p>
              <p style={{ fontSize: 10, color: planColor, fontWeight: 600, textTransform: "capitalize", marginTop: 1 }}>
                {plan} plan
              </p>
            </div>
          </Link>
          <button onClick={logout} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 10, width: "100%",
            background: "none", border: "none", cursor: "pointer",
            fontSize: 12, color: "#64748B", marginTop: 2,
            transition: "all 120ms ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#EEF1F6"; e.currentTarget.style.color = RED; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748B"; }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ marginLeft: 240, flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Impersonation banner */}
        {actingAs && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
            padding: "8px 16px", background: "#F59E0B", color: "#232B3A",
            fontSize: 13, fontWeight: 700, position: "sticky", top: 0, zIndex: 50,
          }}>
            <Eye size={14} /> You are acting as <strong>{actingAs}</strong>
            <button onClick={() => stopImpersonation()} style={{
              padding: "4px 12px", borderRadius: 7, border: "none", cursor: "pointer",
              background: "#232B3A", color: "#fff", fontSize: 12, fontWeight: 700,
            }}>
              Exit impersonation
            </button>
          </div>
        )}
        {/* Topbar */}
        <header style={{
          height: 56, background: "var(--surface-1)",
          borderBottom: "1px solid var(--border-2)",
          display: "flex", alignItems: "center", padding: "0 28px", gap: 12,
          position: "sticky", top: 0, zIndex: 30,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#94A3B8" }}>Workspace</span>
            <ChevronRight size={12} color="#D1D5DB" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", textTransform: "capitalize" }}>
              {pathname.split("/").pop()?.replace(/-/g, " ") || "overview"}
            </span>
          </div>
          <ThemeToggle />
          <button style={{
            width: 32, height: 32, borderRadius: 9,
            background: "#F4EFE7", border: "1px solid #E5E7EB",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#64748B",
            transition: "all 120ms ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = "#232B3A"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#F4EFE7"; e.currentTarget.style.color = "#64748B"; }}
          >
            <Bell size={15} />
          </button>
          <Link href="/dashboard/profile" style={{
            width: 30, height: 30, borderRadius: "50%",
            background: "#EEF1F6", border: `2px solid #D8DEE9`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800, color: RED,
            transition: "transform 120ms ease",
          }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.06)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
          >{initials}</Link>
        </header>

        <main style={{ flex: 1, padding: 28, overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
