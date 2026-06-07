"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, Users, FolderCog, CreditCard,
  Database, Mail, LogOut, ShieldAlert, ChevronRight,
  BarChart3,
} from "lucide-react";
import { T } from "@/app/_components/tokens";

const NAV = [
  { label: "Overview",     href: "/admin",               icon: LayoutDashboard },
  { label: "Profiles",     href: "/admin/profiles",      icon: Users },
  { label: "Campaigns",    href: "/admin/campaigns",     icon: FolderCog },
  { label: "Payments",     href: "/admin/payments",      icon: CreditCard },
  { label: "Global Leads", href: "/admin/leads",         icon: Database },
  { label: "Marketing",    href: "/admin/marketing",     icon: Mail },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin]   = useState(false);
  const [adminEmail, setEmail]  = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/"); return; }
      const { data } = await supabase.from("profiles").select("role,email").eq("id", user.id).single();
      if (data?.role === "admin") { setIsAdmin(true); setEmail(data.email ?? user.email ?? ""); }
      setChecking(false);
    })();
  }, [router]);

  const logout = async () => { await supabase.auth.signOut(); router.push("/"); };

  if (checking) return (
    <div style={{
      minHeight: "100vh", background: "var(--canvas)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          border: "2px solid var(--border-3)",
          borderTopColor: "var(--brand-400)",
          animation: "spin 700ms linear infinite",
        }} />
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Verifying credentials...</p>
      </div>
    </div>
  );

  if (!isAdmin) return (
    <div style={{
      minHeight: "100vh", background: "var(--canvas)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{ textAlign: "center", maxWidth: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "var(--rose-dim)",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "1px solid rgba(244,63,94,0.2)",
        }}>
          <ShieldAlert size={28} style={{ color: "var(--rose)" }} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "var(--text-1)" }}>Access Denied</h1>
        <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.65 }}>
          This area is restricted to system administrators. Your current account role does not
          grant access to the admin portal.
        </p>
        <Link href="/dashboard" style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "10px 20px", borderRadius: "var(--r-md)",
          background: "var(--surface-3)", border: "1px solid var(--border-2)",
          color: "var(--text-1)", fontSize: 13, fontWeight: 600, textDecoration: "none",
        }}>
          <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> Back to Dashboard
        </Link>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--canvas)", color: "var(--text-1)" }}>

      {/* Sidebar */}
      <aside style={{
        width: "var(--sidebar-w)", flexShrink: 0,
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-2)",
        display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, bottom: 0,
        zIndex: 40, overflowY: "auto", overscrollBehavior: "contain",
      }}>
        {/* Logo — clickable */}
        <a href="/admin" style={{ textDecoration: "none", display: "block", padding: "16px 14px 12px", borderBottom: "1px solid var(--border-1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
            <svg width="30" height="19" viewBox="0 0 40 24" fill="none">
              <path d="M2 22 L20 4 L38 22" stroke={T.navy} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M8 22 L20 11 L32 22" stroke="#2F6BFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>Real<span style={{ color: "#2F6BFF" }}>Track</span></span>
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "3px 10px", borderRadius: "var(--r-full)",
            background: "var(--rose-dim)", border: "1px solid rgba(244,63,94,0.2)",
            fontSize: 10, fontWeight: 700, color: "var(--rose-lt)", textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            <ShieldAlert size={10} /> Admin Portal
          </div>
        </a>

        {/* Nav */}
        <div style={{ padding: "14px 8px 8px" }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.10em",
            color: "var(--text-4)", textTransform: "uppercase",
            padding: "0 12px", marginBottom: 6,
          }}>Controls</p>
          <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {NAV.map(({ label, href, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link key={href} href={href} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: "var(--r-md)",
                  textDecoration: "none", fontSize: 13, fontWeight: active ? 600 : 400,
                  background: active ? "var(--brand-dim)" : "transparent",
                  color: active ? "var(--brand-300)" : "var(--text-2)",
                  position: "relative",
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--surface-4)"; e.currentTarget.style.color = "var(--text-1)"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-2)"; } }}
                >
                  {active && (
                    <span style={{
                      position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                      width: 3, height: 16, background: "var(--brand-400)", borderRadius: "0 2px 2px 0",
                    }} />
                  )}
                  <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div style={{ flex: 1 }} />

        {/* Footer */}
        <div style={{ padding: "12px 12px 16px", borderTop: "1px solid var(--border-1)" }}>
          <div style={{ padding: "8px 10px", marginBottom: 4 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {adminEmail}
            </p>
            <p style={{ fontSize: 10, color: "var(--rose-lt)", fontWeight: 600, marginTop: 2 }}>Administrator</p>
          </div>
          <button onClick={logout} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: "var(--r-md)",
            width: "100%", background: "none", border: "none", cursor: "pointer",
            fontSize: 12, color: "var(--text-3)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--rose-dim)"; e.currentTarget.style.color = "var(--rose-lt)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div style={{ marginLeft: "var(--sidebar-w)", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Topbar */}
        <header style={{
          height: "var(--topbar-h)", background: "var(--surface-1)",
          borderBottom: "1px solid var(--border-1)",
          display: "flex", alignItems: "center", padding: "0 28px", gap: 8,
          position: "sticky", top: 0, zIndex: 30,
        }}>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>Admin</span>
          <ChevronRight size={12} color="var(--text-4)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "capitalize" }}>
            {pathname.split("/").pop()?.replace(/-/g, " ") || "overview"}
          </span>
          <Link href="/dashboard" style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
            fontSize: 12, color: "var(--text-3)", textDecoration: "none",
          }}>
            <BarChart3 size={13} /> User Dashboard
          </Link>
        </header>

        <main style={{ flex: 1, padding: 28, overflowY: "auto", overscrollBehavior: "contain" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
