"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Copy, UploadCloud, FileCheck2, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

const PLANS: Record<string, { name: string; price: string; analyses: string; campaigns: string }> = {
  starter:      { name: "Starter",      price: "$49/mo",  analyses: "100 / month",   campaigns: "3 campaigns" },
  professional: { name: "Professional", price: "$149/mo", analyses: "500 / month",   campaigns: "Unlimited campaigns" },
  enterprise:   { name: "Enterprise",   price: "$499/mo", analyses: "Unlimited",     campaigns: "Multi-tenant + white-label" },
};

const BANK = {
  "Bank Name":       "Lead Bank",
  "Bank Address":    "1801 Main St., Kansas City, MO 64108",
  "Account Holder":  "Mohamed Haggag",
  "Account Number":  "217959287957",
  "Routing Number":  "101019644",
};

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);
  return { copied, copy };
}

function PayInner() {
  const params = useSearchParams();
  const planKey = params.get("plan") ?? "professional";
  const priceOverride = params.get("price");
  const plan = PLANS[planKey] ?? PLANS.professional;
  const displayPrice = priceOverride ? `$${priceOverride}/mo` : plan.price;

  const { copied, copy } = useCopy();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ""));
  }, []);

  const drop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setErr("Please attach your transfer confirmation before submitting."); return; }
    setSubmitting(true);
    setErr("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in. Please sign in first.");

      let receiptUrl = "";
      const ext = file.name.split(".").pop();
      const path = `receipts/${user.id}/${Date.now()}.${ext}`;
      const { data: stored, error: storeErr } = await supabase.storage.from("receipts").upload(path, file, { upsert: true });
      if (!storeErr && stored) {
        const { data: pub } = supabase.storage.from("receipts").getPublicUrl(path);
        receiptUrl = pub?.publicUrl ?? "";
      }

      await supabase.from("invoices").insert({
        user_id: user.id,
        plan_tier: planKey,
        amount_usd: parseFloat((priceOverride ?? plan.price).replace(/[^0-9.]/g, "")),
        receipt_url: receiptUrl,
        status: "submitted_verification",
      });

      await supabase.from("profiles").update({
        payment_status: "submitted_verification",
        plan_tier: planKey,
      }).eq("id", user.id);

      setDone(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Submission failed.");
    }
    setSubmitting(false);
  };

  if (done) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
          style={{ background: "var(--accent-dim)" }}>
          <FileCheck2 size={26} style={{ color: "var(--accent)" }} />
        </div>
        <h2 className="text-xl font-black">Payment Submitted</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Your receipt is under review. We typically activate accounts within{" "}
          <strong style={{ color: "var(--text)" }}>1–4 business hours</strong>.
        </p>
        {userEmail && (
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            Confirmation sent to <span style={{ color: "var(--accent)" }}>{userEmail}</span>
          </p>
        )}
        <Link href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: "var(--accent)", color: "#000" }}>
          Go to Dashboard
        </Link>
      </div>
    </div>
  );

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>
      {/* Nav */}
      <nav className="h-14 flex items-center px-6 border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded flex items-center justify-center text-xs font-black"
              style={{ background: "var(--accent)", color: "#000" }}>H</span>
            <span className="text-sm font-bold">HMS <span style={{ color: "var(--accent)" }}>Realty</span></span>
          </div>
          <Link href="/landing"
            className="flex items-center gap-1.5 text-xs font-medium"
            style={{ color: "var(--text-muted)" }}>
            <ArrowLeft size={13} /> Back to plans
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12 grid lg:grid-cols-5 gap-8">

        {/* ── Left panel ── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Order summary */}
          <section className="rounded-2xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="px-5 py-3.5 border-b flex items-center gap-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Order Summary</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold">{plan.name} Plan</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Billed monthly · Cancel anytime</p>
                </div>
                <span className="text-xl font-black" style={{ color: "var(--accent)" }}>{displayPrice}</span>
              </div>
              <div className="pt-3 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
                {[["Analyses", plan.analyses], ["Campaigns", plan.campaigns], ["AI Engine", "Gemini 2.5"]].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span style={{ color: "var(--text-muted)" }}>{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t flex justify-between font-bold" style={{ borderColor: "var(--border)" }}>
                <span style={{ color: "var(--text-muted)" }}>Total Due Today</span>
                <span style={{ color: "var(--accent)" }}>{displayPrice}</span>
              </div>
            </div>
          </section>

          {/* Bank details */}
          <section className="rounded-2xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Wire / ACH Transfer Details</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs"
                style={{ borderColor: "rgba(79,142,255,0.25)", background: "var(--blue-dim)", color: "var(--blue)" }}>
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                Send the exact amount above. Include your email address in the wire memo field.
              </div>

              <div className="space-y-2.5">
                {Object.entries(BANK).map(([label, value]) => {
                  const isKey = label === "Account Number" || label === "Routing Number";
                  return (
                    <div key={label}
                      className="flex items-center justify-between rounded-xl px-4 py-3 border"
                      style={{
                        background: isKey ? "var(--surface)" : "transparent",
                        borderColor: isKey ? "var(--border-light)" : "var(--border)",
                      }}
                    >
                      <div>
                        <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-dim)" }}>{label}</p>
                        <p className={`text-sm ${isKey ? "font-mono font-bold" : "font-medium"}`}>{value}</p>
                      </div>
                      <button
                        onClick={() => copy(value, label)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                        style={copied === label
                          ? { background: "var(--accent-dim)", color: "var(--accent)", borderColor: "var(--accent-glow)" }
                          : { background: "var(--card)", color: "var(--text-muted)", borderColor: "var(--border-light)" }
                        }
                      >
                        {copied === label ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* ── Right panel: upload + submit ── */}
        <div className="lg:col-span-2">
          <form onSubmit={submit}
            className="rounded-2xl border overflow-hidden sticky top-20"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>Upload Transfer Receipt</p>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                After sending your transfer, upload a screenshot or PDF of the bank confirmation. We verify and activate within 1–4 business hours.
              </p>

              {/* Drop zone */}
              <div
                onClick={() => inputRef.current?.click()}
                onDrop={drop}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                className="cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all"
                style={{
                  borderColor: dragging ? "var(--accent)" : file ? "rgba(0,255,204,0.3)" : "var(--border-light)",
                  background: dragging ? "var(--accent-dim)" : file ? "rgba(0,255,204,0.03)" : "var(--surface)",
                }}
              >
                <input ref={inputRef} type="file" accept="image/*,.pdf" onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} className="hidden" />
                {file ? (
                  <div className="space-y-1.5">
                    <FileCheck2 size={28} className="mx-auto" style={{ color: "var(--accent)" }} />
                    <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{file.name}</p>
                    <p className="text-xs" style={{ color: "var(--text-dim)" }}>{(file.size / 1024).toFixed(1)} KB · click to change</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <UploadCloud size={28} className="mx-auto" style={{ color: "var(--text-dim)" }} />
                    <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Drop receipt here or click to browse</p>
                    <p className="text-xs" style={{ color: "var(--text-dim)" }}>PNG, JPG, or PDF</p>
                  </div>
                )}
              </div>

              {err && (
                <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg border"
                  style={{ color: "var(--red)", background: "var(--red-dim)", borderColor: "rgba(255,77,106,0.2)" }}>
                  <AlertCircle size={12} className="shrink-0" /> {err}
                </div>
              )}

              <button type="submit" disabled={submitting}
                className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                style={{ background: "var(--accent)", color: "#000", opacity: submitting ? 0.6 : 1 }}>
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? "Submitting..." : "Submit Payment Confirmation"}
              </button>

              <p className="text-[11px] text-center" style={{ color: "var(--text-dim)" }}>
                Your account stays pending until we confirm receipt of funds.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "14px" }}>Loading...</div>}>
      <PayInner />
    </Suspense>
  );
}
