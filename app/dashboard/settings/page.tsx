"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Upload, Download, Loader2, CheckCircle2, AlertCircle, FileUp } from "lucide-react";
import { Card } from "@/app/_components/Card";

const RED = "#1A1A1A";

export default function SettingsPage() {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const csv = `Manager,Agent Name,Team Name,Trainer Name,Hiring Date
john@example.com,John Smith,Sales Team A,Sarah Johnson,2024-01-15
john@example.com,Jane Doe,Sales Team A,Sarah Johnson,2024-02-01
jane@example.com,Bob Wilson,Sales Team B,Mike Brown,2024-01-20
jane@example.com,Alice Johnson,Sales Team B,Mike Brown,2024-03-10`;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "team-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      const text = await file.text();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const response = await fetch("/api/csv-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ csv: text, userId: user.id }),
      });

      // Safely read body whether server returned JSON, HTML, or empty
      const raw = await response.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch {
        const snippet = raw.slice(0, 120).replace(/\s+/g, " ");
        throw new Error(
          `Server returned non-JSON (HTTP ${response.status}). ` +
          `Likely the API route is missing or the server crashed before responding. ` +
          `First bytes: ${snippet}`
        );
      }

      if (!response.ok) {
        throw new Error(parsed?.error || `Import failed (HTTP ${response.status})`);
      }

      const stats = parsed?.stats ?? {};
      let msg = `Imported ${stats.rows ?? 0} records: ${stats.teams ?? 0} teams, ${stats.callers ?? 0} callers, ${stats.trainers ?? 0} trainers.`;
      if (stats.errors?.length) msg += ` ${stats.errors.length} row(s) had issues — check server logs.`;
      setMessage({ type: "success", text: msg });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Import failed",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };


  return (
    <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A1A1A", marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 13, color: "#6E635A" }}>Manage your team structure and organization.</p>
      </div>

      {/* Messages */}
      {message && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: message.type === "success" ? "#ECFDF5" : "#FBEEE8",
          border: `1px solid ${message.type === "success" ? "#A7F3D0" : "#E7B8A6"}`,
          display: "flex", alignItems: "center", gap: 10,
          color: message.type === "success" ? "#059669" : RED,
          fontSize: 13, fontWeight: 600,
        }}>
          {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Team Import */}
      <Card title="Import Team Structure">
        <p style={{ fontSize: 13, color: "#6E635A", marginBottom: 14, lineHeight: 1.65 }}>
          Upload a CSV file to bulk import your team members, trainers, and managers. This will automatically create teams, assign agents, and set up trainers for your organization.
        </p>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <button onClick={downloadTemplate} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 16px", borderRadius: 8,
            background: "#F3F4F6", border: "1px solid #E5E7EB",
            color: "#3A322B", fontSize: 12, fontWeight: 600, cursor: "pointer",
            transition: "all 120ms ease",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#E5E7EB"}
          onMouseLeave={e => e.currentTarget.style.background = "#F3F4F6"}
          >
            <Download size={13} /> Download Template
          </button>
        </div>

        {/* File Upload */}
        <div
          style={{
            padding: "28px 20px", borderRadius: 10,
            border: "2px dashed #E5E7EB", background: "#FAFAFA",
            textAlign: "center", cursor: "pointer",
            transition: "all 120ms ease",
          }}
          onDragOver={e => {
            e.preventDefault();
            e.currentTarget.style.borderColor = RED;
            e.currentTarget.style.background = "#FBEEE8";
          }}
          onDragLeave={e => {
            e.currentTarget.style.borderColor = "#E5E7EB";
            e.currentTarget.style.background = "#FAFAFA";
          }}
          onDrop={e => {
            e.preventDefault();
            e.currentTarget.style.borderColor = "#E5E7EB";
            e.currentTarget.style.background = "#FAFAFA";
            const file = e.dataTransfer.files[0];
            if (file) {
              if (fileInputRef.current) fileInputRef.current.files = e.dataTransfer.files;
              handleFileUpload(e as unknown as React.ChangeEvent<HTMLInputElement>);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp size={28} style={{ margin: "0 auto 10px", color: "#9C9286" }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 4 }}>
            {uploading ? "Uploading..." : "Drop CSV file or click to browse"}
          </p>
          <p style={{ fontSize: 11, color: "#6E635A" }}>CSV with Manager, Agent Name, Team Name, Trainer Name, Hiring Date</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={uploading}
            style={{ display: "none" }}
          />
        </div>
      </Card>

      {/* CSV Format */}
      <Card title="CSV Format">
        <div style={{
          padding: "12px", borderRadius: 8,
          background: "#F4EFE7", border: "1px solid #E5E7EB",
          fontFamily: "var(--font-mono)", fontSize: 12, color: "#5B5249",
          lineHeight: 1.6, overflowX: "auto",
        }}>
          <p style={{ marginBottom: 8 }}>Manager,Agent Name,Team Name,Trainer Name,Hiring Date</p>
          <p>john@example.com,John Smith,Sales Team A,Sarah Johnson,2024-01-15</p>
          <p>jane@example.com,Jane Doe,Sales Team B,Mike Brown,2024-02-01</p>
        </div>
      </Card>
    </div>
  );
}
