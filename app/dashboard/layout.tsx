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
import { NotificationBell } from "@/app/_components/NotificationBell";
import { ProcessingMonitor } from "@/app/_components/ProcessingMonitor";
import { OnboardingTour } from "@/app/_components/OnboardingTour";
import { QuickHelp } from "@/app/_components/QuickHelp";
import { BrandProvider, useBrand } from "@/app/_components/BrandContext";
import { T } from "@/app/_components/tokens";
import {
  LayoutDashboard, PhoneCall, FolderCog, Zap,
  UserCircle, LogOut, ChevronRight, Shield,
  Send, Users2, Network,
  Flag, Power, UserCog, Eye, Search,
  Settings as SettingsIcon, Webhook, Wallet, Target, Trophy, Palette,
  GitBranch, Flame, Rocket,
} from "lucide-react";

// Corporate Command Center — navigation grouped by company department.
const NAV_GROUPS: { section: string; items: { label: string; href: string; icon: typeof PhoneCall }[] }[] = [
  {
    section: "Floor Operations",
    items: [
      { label: "The Matrix",     href: "/dashboard/matrix",      icon: Network },
      { label: "Leads Pipeline", href: "/dashboard",             icon: GitBranch },
      { label: "Campaigns",      href: "/dashboard/campaigns",   icon: FolderCog },
      { label: "Submit Lead",    href: "/dashboard/submit", icon: Send },
    ],
  },
  {
    section: "QA & Training",
    items: [
      { label: "Leads",       href: "/dashboard/calls",    icon: PhoneCall },
      { label: "QA Persona",  href: "/dashboard/persona",  icon: Zap },
    ],
  },
  {
    section: "Acquisitions",
    items: [
      { label: "Hot Leads Alert", href: "/dashboard/deals",        icon: Flame },
      { label: "Cash Buyers",     href: "/dashboard/dispositions", icon: Users2 },
    ],
  },
  {
    section: "HR & Accounting",
    items: [
      { label: "Floor Agents",    href: "/dashboard/callers",      icon: Users2 },
      { label: "Teams",           href: "/dashboard/teams",        icon: Network },
      { label: "Team Leader",     href: "/dashboard/team-leader",  icon: Flag },
      { label: "Shift Targets",   href: "/dashboard/shift-targets", icon: Target },
      { label: "Compensation",    href: "/dashboard/payroll",      icon: Wallet },
      { label: "Leaderboard",     href: "/dashboard/leaderboard",  icon: Trophy },
    ],
  },
  {
    section: "IT & Administration",
    items: [
      { label: "Setup Wizard",            href: "/dashboard/onboarding",  icon: Rocket },
      { label: "Settings",                href: "/dashboard/settings",    icon: SettingsIcon },
      { label: "Webhooks & Integrations", href: "/dashboard/settings/api", icon: Webhook },
      { label: "Branding",                href: "/dashboard/settings/branding", icon: Palette },
      { label: "Sub-Users",               href: "/dashboard/sub-users",   icon: UserCog },
      { label: "Permissions",             href: "/dashboard/permissions", icon: Power },
    ],
  },
];
const NAV_SECONDARY = [
  { label: "Profile",  href: "/dashboard/profile",  icon: UserCircle },
];

const PLAN_ACCENT: Record<string, string> = {
  free: "#94A3B8", starter: "#0EA5E9", professional: "#0284C7", enterprise: "#0369A1",
};

// Workspace mark — uses tenant branding when set, RealTrack default otherwise.
function RealTrackMark({ size = 28 }: { size?: number }) {
  const brand = useBrand();
  if (brand.isCustom && brand.logoUrl) {
    return <img src={brand.logoUrl} alt={brand.name} style={{ height: size * 0.85, maxWidth: 200, objectFit: "contain" }} />;
  }
  const accent = brand.isCustom ? brand.color : "#059669";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <svg width={size * 1.25} height={size * 0.8} viewBox="0 0 40 24" fill="none">
        <path d="M3 21 L20 5 L37 21" stroke="#000000" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10 21 L20 12 L30 21" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{
        fontSize: 16, fontWeight: 900, color: "#000000",
        letterSpacing: "0.08em", lineHeight: 1, fontFamily: "var(--font-sans)",
      }}>{brand.isCustom ? brand.name.toUpperCase() : "REALTRACK"}</span>
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
        background: active ? "#F0F9FF" : hover ? "#F8FAFC" : "transparent",
        color: active ? SKY : "#000000",
        fontSize: 13, fontWeight: active ? 700 : 500,
        transform: hover && !active ? "translateX(2px)" : "translateX(0)",
        transition: "all 180ms cubic-bezier(0.16, 1, 0.30, 1)",
      }}
    >
      {active && (
        <span style={{
          position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
          width: 3, height: 18, borderRadius: "0 3px 3px 0",
          background: SKY,
        }} />
      )}
      <Icon size={16} strokeWidth={active ? 2.3 : 1.9}
        color={active ? SKY : "#475569"}
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
  return <BrandProvider><DashboardLayoutInner>{children}</DashboardLayoutInner></BrandProvider>;
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [email, setEmail]     = useState("");
  const [fullName, setFullName] = useState("");
  const [plan, setPlan]       = useState("free");
  const [initials, setInit]   = useState("?");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCaller, setIsCaller] = useState(false);
  const [actingAs, setActingAs] = useState<string | null>(null);

  useEffect(() => {
    setActingAs(impersonationTarget());
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/"; return; }
      const e = user.email ?? "";
      setEmail(e); setInit(e.slice(0, 2).toUpperCase());
      const { data } = await supabase.from("profiles").select("plan_tier,role,full_name,parent_user_id,is_approved").eq("id", user.id).maybeSingle();
      if (data) {
        setPlan(data.plan_tier ?? "free");
        setIsAdmin(data.role === "admin");
        if (data.full_name) setFullName(data.full_name as string);
        const callerRole = data.role === "caller" || (data.role === "user" && data.parent_user_id);
        setIsCaller(!!callerRole);
        // Approval gate: top-level signups (no parent) need admin approval
        // before they can use the dashboard. Admins are always allowed.
        const onPendingPage = window.location.pathname === "/dashboard/pending";
        if (data.is_approved === false && !data.parent_user_id && data.role !== "admin" && !onPendingPage) {
          window.location.href = "/dashboard/pending";
          return;
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (isCaller && pathname === "/dashboard") {
      window.location.href = "/dashboard/my-leads";
    }
  }, [isCaller, pathname]);

  const logout = async () => { await supabase.auth.signOut(); window.location.href = "/"; };
  const planAccent = PLAN_ACCENT[plan] ?? "#94A3B8";
  const displayName = fullName || email;

  return (
    // Indestructible native-scroll SaaS shell. No Lenis here — the sidebar and
    // main content each own a real CSS scroll container.
    <div className="flex h-screen w-full overflow-hidden" style={{ background: "var(--canvas)", color: "var(--text-1)" }}>

      {/* ───────── SIDEBAR — white, sky indicators, native scroll ───────── */}
      <aside className="h-full overflow-y-auto border-r flex-shrink-0" style={{
        width: 256,
        background: "#FFFFFF",
        borderRight: "1px solid var(--border-2)",
        display: "flex", flexDirection: "column",
        boxShadow: "var(--shadow-sm)",
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
          if (isCaller) {
            const callerNav = [
              { label: "My Dashboard", href: "/dashboard/my-leads", icon: LayoutDashboard },
            ];
            return (
              <div style={{ padding: "16px 8px 4px" }}>
                <SectionLabel>My Account</SectionLabel>
                <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
                  {callerNav.map(item => (
                    <NavLink key={item.label} item={item} active={pathname === item.href} />
                  ))}
                </nav>
              </div>
            );
          }
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

      {/* ───────── MAIN — native scroll container ───────── */}
      <main className="flex-1 h-full overflow-y-auto relative" style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>

        {actingAs && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
            padding: "10px 16px",
            background: T.gradPrimary, color: "#fff",
            fontSize: 13, fontWeight: 700, position: "sticky", top: 0, zIndex: 50,
            boxShadow: "0 4px 18px rgba(14,165,233,0.35)",
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
          <NotificationBell />
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

        {/* Content — scrolls natively inside <main> */}
        <div style={{ flex: 1, padding: "30px 36px 60px" }}>
          {children}
        </div>
      </main>
      <OmniSearch />
      <ProcessingMonitor />
      <OnboardingTour />
      <QuickHelp />
    </div>
  );
}
