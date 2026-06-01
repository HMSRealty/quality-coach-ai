"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import {
  Upload, FileText, Loader2, Plus, Users, Calendar,
  BookOpen, X, Trash2, ExternalLink, CheckCircle2, AlertCircle,
} from "lucide-react";

const NAVY = "#0A1E3F";
const TEAL = "#0DAFAF";
const GOLD = "#C8A24B";
const SLATE = "#475569";

interface Batch {
  id: string;
  name: string;
  trainer_id: string | null;
  start_date: string | null;
  notes: string | null;
  trainee_count: number;
  created_at: string;
}
interface Trainer { id: string; name: string; }
interface Material {
  id: string;
  title: string;
  description: string | null;
  storage_url: string | null;
  material_type: string | null;
  created_at: string;
}
interface Session {
  id: string;
  trainer_id: string | null;
  batch_id: string | null;
  topic: string;
  notes: string;
  session_date: string;
  duration_minutes: number | null;
  created_at: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 9,
  background: "#F4F7FB", border: "1px solid rgba(10,30,63,0.10)",
  fontSize: 13, color: NAVY, outline: "none",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: SLATE, marginBottom: 6,
};

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(10,30,63,0.50)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      backdropFilter: "blur(4px)", padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#FFF", borderRadius: 16, padding: 28, maxWidth: 520, width: "100%",
        boxShadow: "0 24px 80px rgba(10,30,63,0.30)",
        maxHeight: "90vh", overflowY: "auto",
      }} className="animate-scale">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>{title}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: SLATE, padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Modals
  const [showBatch, setShowBatch] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);
  const [showSession, setShowSession] = useState(false);

  // New batch
  const [newBatch, setNewBatch] = useState({ name: "", trainer_id: "", start_date: new Date().toISOString().split("T")[0], notes: "", trainee_count: "" });
  const [savingBatch, setSavingBatch] = useState(false);

  // New material
  const [newMat, setNewMat] = useState({ title: "", description: "", material_type: "document" });
  const [matFile, setMatFile] = useState<File | null>(null);
  const matFileInputRef = useRef<HTMLInputElement>(null);
  const [savingMat, setSavingMat] = useState(false);

  // New session
  const [newSess, setNewSess] = useState({ trainer_id: "", batch_id: "", topic: "", notes: "", session_date: new Date().toISOString().split("T")[0], duration_minutes: "" });
  const [savingSess, setSavingSess] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [tRes, bRes, mRes, sRes] = await Promise.all([
      supabase.from("trainers").select("id, name").eq("user_id", user.id).order("name"),
      supabase.from("training_batches").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("training_materials").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("training_sessions").select("*").eq("user_id", user.id).order("session_date", { ascending: false }),
    ]);

    setTrainers((tRes.data || []) as Trainer[]);
    setBatches((bRes.data || []) as Batch[]);
    setMaterials((mRes.data || []) as Material[]);
    setSessions((sRes.data || []) as Session[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const saveBatch = async () => {
    if (!newBatch.name) return showToast("err", "Batch name required");
    setSavingBatch(true);
    const { error } = await supabase.from("training_batches").insert({
      user_id: userId,
      name: newBatch.name,
      trainer_id: newBatch.trainer_id || null,
      start_date: newBatch.start_date || null,
      notes: newBatch.notes || null,
      trainee_count: newBatch.trainee_count ? parseInt(newBatch.trainee_count) : 0,
    });
    setSavingBatch(false);
    if (error) return showToast("err", error.message);
    showToast("ok", "Batch created");
    setNewBatch({ name: "", trainer_id: "", start_date: new Date().toISOString().split("T")[0], notes: "", trainee_count: "" });
    setShowBatch(false);
    load();
  };

  const saveMaterial = async () => {
    if (!newMat.title) return showToast("err", "Title required");
    setSavingMat(true);

    let storageUrl: string | null = null;
    if (matFile) {
      const ext = matFile.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("training-materials").upload(path, matFile);
      if (upErr) {
        setSavingMat(false);
        return showToast("err", "Upload failed: " + upErr.message + " (create 'training-materials' bucket)");
      }
      const { data: pub } = supabase.storage.from("training-materials").getPublicUrl(path);
      storageUrl = pub.publicUrl;
    }

    const { error } = await supabase.from("training_materials").insert({
      user_id: userId,
      title: newMat.title,
      description: newMat.description || null,
      material_type: newMat.material_type,
      storage_url: storageUrl,
      file_size_bytes: matFile?.size || null,
    });
    setSavingMat(false);
    if (error) return showToast("err", error.message);
    showToast("ok", "Material uploaded");
    setNewMat({ title: "", description: "", material_type: "document" });
    setMatFile(null);
    setShowMaterial(false);
    load();
  };

  const saveSession = async () => {
    if (!newSess.topic) return showToast("err", "Topic required");
    setSavingSess(true);
    const { error } = await supabase.from("training_sessions").insert({
      user_id: userId,
      trainer_id: newSess.trainer_id || null,
      batch_id: newSess.batch_id || null,
      topic: newSess.topic,
      notes: newSess.notes,
      session_date: newSess.session_date,
      duration_minutes: newSess.duration_minutes ? parseInt(newSess.duration_minutes) : null,
    });
    setSavingSess(false);
    if (error) return showToast("err", error.message);
    showToast("ok", "Session logged");
    setNewSess({ trainer_id: "", batch_id: "", topic: "", notes: "", session_date: new Date().toISOString().split("T")[0], duration_minutes: "" });
    setShowSession(false);
    load();
  };

  const deleteRow = async (table: string, id: string) => {
    if (!confirm("Delete this entry?")) return;
    await supabase.from(table).delete().eq("id", id);
    load();
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: "40px 24px" }}>
      <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 12px", color: NAVY }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Trainer Portal</h1>
        <p style={{ fontSize: 13, color: SLATE }}>Manage batches, training materials, and coaching documentation.</p>
      </div>

      {toast && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: toast.type === "ok" ? "#ECFDF5" : "#FEF2F2",
          border: `1px solid ${toast.type === "ok" ? "#A7F3D0" : "#FCA5A5"}`,
          color: toast.type === "ok" ? "#059669" : "#DC2626",
          fontSize: 13, fontWeight: 600, display: "flex", gap: 8, alignItems: "center",
        }}>
          {toast.type === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Batches */}
      <Card padding={0}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(10,30,63,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: NAVY, display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={16} color={GOLD} /> Training Batches
          </h3>
          <button onClick={() => setShowBatch(true)} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8,
            background: NAVY, color: "#fff", border: "none",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            <Plus size={13} /> New Batch
          </button>
        </div>
        {batches.length === 0 ? (
          <p style={{ padding: 30, textAlign: "center", color: SLATE, fontSize: 13 }}>
            No batches yet. Create your first training batch to track new trainee cohorts.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {batches.map(b => {
              const t = trainers.find(t => t.id === b.trainer_id);
              return (
                <div key={b.id} style={{ padding: "14px 22px", borderTop: "1px solid rgba(10,30,63,0.05)", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: `${GOLD}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Users size={16} color={GOLD} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{b.name}</p>
                    <p style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>
                      {t?.name || "Unassigned trainer"} · {b.trainee_count} trainees
                      {b.start_date && ` · started ${new Date(b.start_date).toLocaleDateString()}`}
                    </p>
                    {b.notes && <p style={{ fontSize: 11, color: SLATE, marginTop: 4, fontStyle: "italic" }}>{b.notes}</p>}
                  </div>
                  <button onClick={() => deleteRow("training_batches", b.id)} style={{
                    padding: 6, background: "transparent", border: "none", cursor: "pointer", color: SLATE,
                  }}><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Materials */}
      <Card padding={0}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(10,30,63,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: NAVY, display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={16} color={TEAL} /> Training Materials
          </h3>
          <button onClick={() => setShowMaterial(true)} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8,
            background: TEAL, color: "#fff", border: "none",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            <Upload size={13} /> Upload Material
          </button>
        </div>
        {materials.length === 0 ? (
          <p style={{ padding: 30, textAlign: "center", color: SLATE, fontSize: 13 }}>
            No materials yet. Upload scripts, guides, or videos for your trainees.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {materials.map(m => (
              <div key={m.id} style={{ padding: "14px 22px", borderTop: "1px solid rgba(10,30,63,0.05)", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `${TEAL}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FileText size={16} color={TEAL} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{m.title}</p>
                  <p style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>
                    {m.material_type || "document"} · {new Date(m.created_at).toLocaleDateString()}
                  </p>
                  {m.description && <p style={{ fontSize: 11, color: SLATE, marginTop: 4 }}>{m.description}</p>}
                </div>
                {m.storage_url && (
                  <a href={m.storage_url} target="_blank" rel="noreferrer" style={{ padding: 6, color: NAVY }}>
                    <ExternalLink size={14} />
                  </a>
                )}
                <button onClick={() => deleteRow("training_materials", m.id)} style={{
                  padding: 6, background: "transparent", border: "none", cursor: "pointer", color: SLATE,
                }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Coaching Documentation */}
      <Card padding={0}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(10,30,63,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: NAVY, display: "flex", alignItems: "center", gap: 8 }}>
            <BookOpen size={16} color={NAVY} /> Documented Training Sessions
          </h3>
          <button onClick={() => setShowSession(true)} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8,
            background: NAVY, color: "#fff", border: "none",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            <Plus size={13} /> Document Session
          </button>
        </div>
        {sessions.length === 0 ? (
          <p style={{ padding: 30, textAlign: "center", color: SLATE, fontSize: 13 }}>
            No documented sessions. Log coaching sessions with topic, notes, and date.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sessions.map(s => {
              const t = trainers.find(t => t.id === s.trainer_id);
              const b = batches.find(b => b.id === s.batch_id);
              return (
                <div key={s.id} style={{ padding: "14px 22px", borderTop: "1px solid rgba(10,30,63,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: `${NAVY}10`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <BookOpen size={16} color={NAVY} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{s.topic}</p>
                      <p style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>
                        <Calendar size={10} style={{ display: "inline", marginBottom: -1 }} /> {new Date(s.session_date).toLocaleDateString()}
                        {s.duration_minutes && ` · ${s.duration_minutes} min`}
                        {t && ` · ${t.name}`}
                        {b && ` · ${b.name}`}
                      </p>
                    </div>
                    <button onClick={() => deleteRow("training_sessions", s.id)} style={{
                      padding: 6, background: "transparent", border: "none", cursor: "pointer", color: SLATE,
                    }}><Trash2 size={13} /></button>
                  </div>
                  {s.notes && (
                    <p style={{ fontSize: 12, color: SLATE, lineHeight: 1.6, padding: "10px 12px", background: "#F4F7FB", borderRadius: 8, marginLeft: 50 }}>
                      {s.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modals */}
      {showBatch && (
        <Modal onClose={() => setShowBatch(false)} title="New Training Batch">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={labelStyle}>Batch Name *</label>
              <input value={newBatch.name} onChange={e => setNewBatch({ ...newBatch, name: e.target.value })} placeholder="e.g. Spring 2026 Cohort" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>Trainer</label>
                <select value={newBatch.trainer_id} onChange={e => setNewBatch({ ...newBatch, trainer_id: e.target.value })} style={inputStyle}>
                  <option value="">— None —</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Trainee Count</label>
                <input type="number" value={newBatch.trainee_count} onChange={e => setNewBatch({ ...newBatch, trainee_count: e.target.value })} placeholder="0" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input type="date" value={newBatch.start_date} onChange={e => setNewBatch({ ...newBatch, start_date: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea value={newBatch.notes} onChange={e => setNewBatch({ ...newBatch, notes: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Focus areas, goals, etc." />
            </div>
            <button onClick={saveBatch} disabled={savingBatch} style={{
              padding: "11px 16px", borderRadius: 10, background: NAVY, color: "#fff",
              fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4,
            }}>
              {savingBatch ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create Batch
            </button>
          </div>
        </Modal>
      )}

      {showMaterial && (
        <Modal onClose={() => setShowMaterial(false)} title="Upload Training Material">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={labelStyle}>Title *</label>
              <input value={newMat.title} onChange={e => setNewMat({ ...newMat, title: e.target.value })} placeholder="e.g. Cold Call Opening Script v2" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={newMat.material_type} onChange={e => setNewMat({ ...newMat, material_type: e.target.value })} style={inputStyle}>
                <option value="document">Document</option>
                <option value="script">Script</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea value={newMat.description} onChange={e => setNewMat({ ...newMat, description: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div onClick={() => matFileInputRef.current?.click()} style={{
              padding: 16, borderRadius: 10, border: `2px dashed ${TEAL}40`,
              background: "#F0FAFA", textAlign: "center", cursor: "pointer",
            }}>
              <Upload size={20} color={TEAL} style={{ margin: "0 auto 6px" }} />
              <p style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>
                {matFile?.name || "Click to attach file (optional)"}
              </p>
              <input ref={matFileInputRef} type="file" onChange={e => setMatFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
            </div>
            <button onClick={saveMaterial} disabled={savingMat} style={{
              padding: "11px 16px", borderRadius: 10, background: TEAL, color: "#fff",
              fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4,
            }}>
              {savingMat ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
            </button>
          </div>
        </Modal>
      )}

      {showSession && (
        <Modal onClose={() => setShowSession(false)} title="Document Training Session">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={labelStyle}>Topic *</label>
              <input value={newSess.topic} onChange={e => setNewSess({ ...newSess, topic: e.target.value })} placeholder="e.g. Handling 'I'm not interested' objection" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>Trainer</label>
                <select value={newSess.trainer_id} onChange={e => setNewSess({ ...newSess, trainer_id: e.target.value })} style={inputStyle}>
                  <option value="">— None —</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Batch</label>
                <select value={newSess.batch_id} onChange={e => setNewSess({ ...newSess, batch_id: e.target.value })} style={inputStyle}>
                  <option value="">— None —</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={newSess.session_date} onChange={e => setNewSess({ ...newSess, session_date: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Duration (min)</label>
                <input type="number" value={newSess.duration_minutes} onChange={e => setNewSess({ ...newSess, duration_minutes: e.target.value })} placeholder="60" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Notes / Action items</label>
              <textarea value={newSess.notes} onChange={e => setNewSess({ ...newSess, notes: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical" }} placeholder="What was covered, who improved, what to revisit next session..." />
            </div>
            <button onClick={saveSession} disabled={savingSess} style={{
              padding: "11px 16px", borderRadius: 10, background: NAVY, color: "#fff",
              fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4,
            }}>
              {savingSess ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save Session
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
