"use client";

export const runtime = "edge";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Clock, LogOut, RefreshCw, CreditCard, CheckCircle2, FileCheck2 } from "lucide-react";

const NAVY = "#15302e";
const SLATE = "#475569";
const MONEY = "#0a5f52";

type Status = "unpaid" | "submitted_verification" | "paid" | "free" | "unknown";

export default function PendingApproval() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<Status>("unknown");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/"; return; }
      setEmail(user.email || "");
      const { data } = await supabase.from("profiles")
        .select("full_name, is_approved, payment_status")
        .eq("id", user.id).maybeSingle();
      if (data?.full_name) setName(data.full_name as string);
      setPaymentStatus((data?.payment_status as Status) || "unpaid");
      if (data?.is_approved) window.location.href = "/dashboard";
    })();
  }, []);

  const recheck = async () => {
    setChecking(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/"; return; }
    const { data } = await supabase.from("profiles").select("is_approved, payment_status").eq("id", user.id).maybeSingle();
    setChecking(false);
    if (data?.is_approved) window.location.href = "/dashboard";
    else if (data?.payment_status) setPaymentStatus(data.payment_status as Status);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  // Decide which block to show based on the payment lifecycle.
  const isAwaitingReceipt = paymentStatus === "unpaid" || paymentStatus === "free" || paymentStatus === "unknown";
  const isReceiptSubmitted = paymentStatus === "submitted_verification";
  // paid + !is_approved is the rare race between payment marked paid and approval flag flipping — show same as submitted.

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #F8FAFC 0%, #EFF6FF 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        maxWidth: 520, width: "100%", background: "#fff",
        borderRadius: 18, padding: 36,
        boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
        border: "1px solid #E2E8F0",
        textAlign: "center",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: isReceiptSubmitted
            ? "linear-gradient(135deg, #e3a23a, #D97706)"
            : "linear-gradient(135deg, #0e7c6b, #0a5f52)",
          margin: "0 auto 18px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {isReceiptSubmitted ? <FileCheck2 size={28} color="#fff" /> : <Clock size={28} color="#fff" />}
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 900, color: NAVY, marginBottom: 8 }}>
          {isReceiptSubmitted ? "Receipt Under Review" : "Activate Your Account"}
        </h1>
        <p style={{ fontSize: 14, color: SLATE, lineHeight: 1.6, marginBottom: 22 }}>
          {name ? `Hi ${name.split(" ")[0]} — ` : ""}
          {isReceiptSubmitted
            ? <>your payment receipt is being reviewed. We typically activate accounts within <strong style={{ color: NAVY }}>1–4 business hours</strong>. You&apos;ll get an email when access is granted.</>
            : <>your account <strong style={{ color: NAVY }}>{email}</strong> is created. Choose a plan and complete the bank transfer to unlock your dashboard.</>
          }
        </p>

        {isAwaitingReceipt && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
            <a href="/pay" style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "13px 22px", borderRadius: 11, border: "none",
              background: "linear-gradient(135deg, #0e7c6b, #0a5f52)", color: "#fff",
              fontSize: 14, fontWeight: 800, cursor: "pointer", textDecoration: "none",
              boxShadow: "0 8px 20px rgba(10,95,82,0.30)",
            }}>
              <CreditCard size={15} /> View Plans & Pay
            </a>
            <p style={{ fontSize: 11, color: SLATE }}>
              We&apos;ll send you bank transfer details on the next page. After your transfer, upload the receipt and wait for approval.
            </p>
          </div>
        )}

        {isReceiptSubmitted && (
          <div style={{
            background: "#FEFCE8", border: "1px solid #FDE68A",
            borderRadius: 12, padding: 14, marginBottom: 18,
            textAlign: "left",
          }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#854D0E", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={13} /> Receipt received
            </p>
            <p style={{ fontSize: 12, color: "#854D0E", lineHeight: 1.5 }}>
              Hang tight — we&apos;ll activate your account within 1–4 business hours. Refresh with the button below once you get the email.
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: 9 }}>
          <button onClick={recheck} disabled={checking} style={{
            flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
            padding: "11px 18px", borderRadius: 10,
            background: "#fff", border: "1px solid #E2E8F0", color: NAVY,
            fontSize: 13, fontWeight: 700, cursor: checking ? "wait" : "pointer",
          }}>
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking..." : "Check Status"}
          </button>
          <button onClick={logout} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "11px 16px", borderRadius: 10,
            border: "1px solid #E2E8F0", background: "#fff", color: SLATE,
            fontSize: 12.5, fontWeight: 700, cursor: "pointer",
          }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>

        <p style={{ fontSize: 11, color: SLATE, marginTop: 22 }}>
          Need help? Email <a href="mailto:info@realtrack.app" style={{ color: "#0a5f52", fontWeight: 700 }}>info@realtrack.app</a>
        </p>
      </div>
    </div>
  );
}
