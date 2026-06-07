"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/app/_components/Card";
import {
  Headphones, Phone, PhoneOff, Mic, MicOff, Users, Circle,
  Volume2, VolumeX, Search, Loader2, PhoneIncoming,
} from "lucide-react";

import { T } from "@/app/_components/tokens";
const NAVY = T.text1;
const TEAL = T.teal;
const GOLD = T.teal;
const SLATE = T.text2;

type CallState = "idle" | "calling" | "ringing-incoming" | "connected";

interface Peer {
  user_id: string;
  name: string;
  email: string;
  role: "admin" | "user";
}

interface IncomingCall {
  callId: string;
  fromUserId: string;
  fromName: string;
  offer: RTCSessionDescriptionInit;
}

// STUN finds your public IP; TURN relays media when both peers are behind
// strict NATs/firewalls (most home & office networks). Without TURN the call
// shows "connecting" forever with no audio. These are OpenRelay's free public
// TURN servers — fine for a trial. For production, swap in your own
// (Twilio / Cloudflare Calls / Metered) credentials.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

function randId() {
  return Math.random().toString(36).slice(2, 12);
}

export default function DialerPage() {
  const [me, setMe] = useState<{ id: string; email: string; role: string } | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [callState, setCallState] = useState<CallState>("idle");
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [statusText, setStatusText] = useState("");

  // Refs that must survive renders
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callIdRef = useRef<string | null>(null);
  const callChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const inboxChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const peerUserIdRef = useRef<string | null>(null);

  // ── Load me + dialable peers ──
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from("profiles").select("id, email, role")
        .eq("id", user.id).maybeSingle();
      if (profile) setMe(profile);

      // Dialer only works between authenticated users — load profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, role")
        .neq("id", user.id)
        .order("email");

      const list: Peer[] = (profiles || []).map(p => ({
        user_id: p.id,
        name: p.email.split("@")[0],
        email: p.email,
        role: p.role === "admin" ? "admin" : "user",
      }));
      setPeers(list);
      setLoading(false);
    })();
  }, []);

  // ── Subscribe to MY inbox for incoming calls ──
  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    const ch = supabase.channel(`dialer-inbox-${me.id}-${Date.now()}-${randId()}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    ch.on("broadcast", { event: "incoming" }, (msg) => {
      if (cancelled) return;
      const p = msg.payload as IncomingCall;
      // If already in a call, auto-reject by sending hangup
      if (callState !== "idle") {
        sendDirectTo(p.fromUserId, "rejected", { callId: p.callId, reason: "busy" });
        return;
      }
      setIncoming(p);
      setCallState("ringing-incoming");
      setStatusText(`Incoming call from ${p.fromName}`);
    });
    ch.on("broadcast", { event: "rejected" }, (msg) => {
      const p = msg.payload as { callId: string; reason?: string };
      if (callIdRef.current === p.callId) {
        setStatusText(p.reason === "busy" ? "User is busy" : "Call rejected");
        cleanup();
      }
    });
    ch.on("broadcast", { event: "hangup" }, (msg) => {
      const p = msg.payload as { callId: string };
      if (callIdRef.current === p.callId) {
        setStatusText("Call ended by other party");
        cleanup();
      }
    });

    // Subscribe — must use a channel that's actually SUBSCRIBED on a remote routing target
    // For the inbox we subscribe and listen
    // Actually we need this inbox channel listed on the server: we use it WITH the target's ID
    // Hmm — re-examining: we want OTHER users to broadcast to THIS channel name.
    // Supabase Realtime broadcast works when both subscribers join the SAME channel name.
    // So my "inbox" channel name is `dialer-inbox-${me.id}` (deterministic, no random suffix).
    // The sender will also momentarily subscribe to that exact name to send.
    // → Use deterministic name without random:
    supabase.removeChannel(ch); // discard the test instance above

    const stableCh = supabase.channel(`dialer-inbox-${me.id}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    stableCh.on("broadcast", { event: "incoming" }, (msg) => {
      if (cancelled) return;
      const p = msg.payload as IncomingCall;
      if (callState !== "idle") {
        sendDirectTo(p.fromUserId, "rejected", { callId: p.callId, reason: "busy" });
        return;
      }
      setIncoming(p);
      setCallState("ringing-incoming");
      setStatusText(`Incoming call from ${p.fromName}`);
    });
    stableCh.on("broadcast", { event: "rejected" }, (msg) => {
      const p = msg.payload as { callId: string; reason?: string };
      if (callIdRef.current === p.callId) {
        setStatusText(p.reason === "busy" ? "User is busy" : "Call rejected");
        cleanup();
      }
    });
    stableCh.on("broadcast", { event: "hangup" }, (msg) => {
      const p = msg.payload as { callId: string };
      if (callIdRef.current === p.callId) {
        setStatusText("Call ended by other party");
        cleanup();
      }
    });
    stableCh.subscribe();
    inboxChannelRef.current = stableCh;

    return () => {
      cancelled = true;
      if (inboxChannelRef.current) {
        supabase.removeChannel(inboxChannelRef.current);
        inboxChannelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  // ── Call duration timer ──
  useEffect(() => {
    if (callState === "connected") {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  // ── Helper: send a one-shot broadcast to a specific user's inbox ──
  async function sendDirectTo(targetUserId: string, event: string, payload: Record<string, unknown>) {
    const ch = supabase.channel(`dialer-inbox-${targetUserId}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    await new Promise<void>((resolve) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });
    await ch.send({ type: "broadcast", event, payload });
    setTimeout(() => supabase.removeChannel(ch), 500);
  }

  // ── Helper: send signal on the per-call channel ──
  function sendOnCallChannel(event: string, payload: Record<string, unknown>) {
    if (!callChannelRef.current) return;
    callChannelRef.current.send({ type: "broadcast", event, payload });
  }

  // ── Build a fresh RTCPeerConnection wired for current call ──
  function buildPeerConnection(isCaller: boolean) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendOnCallChannel("ice", { candidate: e.candidate.toJSON(), from: isCaller ? "caller" : "callee" });
      }
    };

    pc.ontrack = (e) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallState("connected");
        setStatusText("Connected");
      } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setStatusText("Connection lost");
        cleanup();
      }
    };

    pcRef.current = pc;
    return pc;
  }

  async function getMic(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  }

  // ── Subscribe to a per-call channel and wire signal handlers ──
  async function joinCallChannel(callId: string, isCaller: boolean) {
    const ch = supabase.channel(`call-${callId}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    ch.on("broadcast", { event: "answer" }, async (msg) => {
      const p = msg.payload as { answer: RTCSessionDescriptionInit };
      if (!pcRef.current || !isCaller) return;
      await pcRef.current.setRemoteDescription(p.answer);
      remoteDescSetRef.current = true;
      // flush any queued ICE
      for (const c of pendingIceRef.current) {
        await pcRef.current.addIceCandidate(c).catch(() => {});
      }
      pendingIceRef.current = [];
    });

    ch.on("broadcast", { event: "ice" }, async (msg) => {
      const p = msg.payload as { candidate: RTCIceCandidateInit; from: "caller" | "callee" };
      // Ignore our own ICE
      if ((isCaller && p.from === "caller") || (!isCaller && p.from === "callee")) return;
      if (!pcRef.current) return;
      if (!remoteDescSetRef.current) {
        pendingIceRef.current.push(p.candidate);
        return;
      }
      await pcRef.current.addIceCandidate(p.candidate).catch(() => {});
    });

    ch.on("broadcast", { event: "hangup" }, () => {
      setStatusText("Call ended");
      cleanup();
    });

    await new Promise<void>((resolve) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });
    callChannelRef.current = ch;
  }

  // ── Outgoing call ──
  async function startCall(peer: Peer) {
    if (!me) return;
    try {
      setSelectedPeer(peer);
      peerUserIdRef.current = peer.user_id;
      setCallState("calling");
      setStatusText(`Calling ${peer.name}...`);

      const callId = randId();
      callIdRef.current = callId;

      // Subscribe to the per-call channel first (so we can receive answer + ICE)
      await joinCallChannel(callId, true);

      const stream = await getMic();
      const pc = buildPeerConnection(true);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      // Ping the callee's inbox with the offer
      await sendDirectTo(peer.user_id, "incoming", {
        callId,
        fromUserId: me.id,
        fromName: me.email,
        offer: { type: offer.type, sdp: offer.sdp },
      });

      setStatusText(`Ringing ${peer.name}...`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start call";
      setStatusText(msg);
      alert(`Call failed: ${msg}. Mic permission?`);
      cleanup();
    }
  }

  // ── Accept incoming ──
  async function acceptIncoming() {
    if (!incoming || !me) return;
    try {
      callIdRef.current = incoming.callId;
      peerUserIdRef.current = incoming.fromUserId;
      setSelectedPeer({
        user_id: incoming.fromUserId,
        name: incoming.fromName.split("@")[0],
        email: incoming.fromName,
        role: "user",
      });
      setStatusText("Connecting...");

      await joinCallChannel(incoming.callId, false);

      const stream = await getMic();
      const pc = buildPeerConnection(false);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(incoming.offer);
      remoteDescSetRef.current = true;
      // Flush queued ICE if any
      for (const c of pendingIceRef.current) {
        await pc.addIceCandidate(c).catch(() => {});
      }
      pendingIceRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Broadcast answer on the per-call channel — caller is subscribed there
      sendOnCallChannel("answer", { answer: { type: answer.type, sdp: answer.sdp } });

      setIncoming(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to accept";
      alert(`Accept failed: ${msg}. Mic permission?`);
      rejectIncoming();
    }
  }

  // ── Reject incoming ──
  async function rejectIncoming() {
    if (!incoming) return;
    await sendDirectTo(incoming.fromUserId, "rejected", { callId: incoming.callId, reason: "declined" });
    setIncoming(null);
    cleanup();
  }

  // ── Hang up ──
  async function hangup() {
    if (callIdRef.current && peerUserIdRef.current) {
      sendOnCallChannel("hangup", { callId: callIdRef.current });
      // Also notify their inbox in case call channel didn't form
      await sendDirectTo(peerUserIdRef.current, "hangup", { callId: callIdRef.current });
    }
    setStatusText("Call ended");
    cleanup();
  }

  // ── Cleanup current call state (does NOT remove inbox channel) ──
  function cleanup() {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (callChannelRef.current) {
      supabase.removeChannel(callChannelRef.current);
      callChannelRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    callIdRef.current = null;
    peerUserIdRef.current = null;
    remoteDescSetRef.current = false;
    pendingIceRef.current = [];
    setCallDuration(0);
    setSelectedPeer(null);
    setIncoming(null);
    setMuted(false);
    setCallState("idle");
    setTimeout(() => setStatusText(""), 2500);
  }

  function toggleMute() {
    if (!localStreamRef.current) return;
    const next = !muted;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  }

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const filteredPeers = peers.filter(p =>
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 24px" }}>
        <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 12px", color: NAVY }} />
        <p style={{ color: SLATE }}>Loading dialer...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }} className="animate-in">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Roleplay Dialer</h1>
          <p style={{ fontSize: 13, color: SLATE }}>
            Direct browser-to-browser calls via WebRTC. {me?.email && <span style={{ color: TEAL, fontWeight: 600 }}>Logged in as {me.email}</span>}
          </p>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 999,
          background: callState === "connected" ? "#ECFDF5" : "#F1F4F9",
          border: `1px solid ${callState === "connected" ? "#A7F3D0" : "rgba(35,43,58,0.08)"}`,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: callState === "connected" ? "#10B981" : "#94A3B8",
            animation: callState === "connected" ? "pulse 2s ease-in-out infinite" : "none",
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: callState === "connected" ? "#059669" : SLATE }}>
            {callState === "connected" ? "LIVE CALL" : callState === "calling" ? "RINGING" : "Idle"}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 22 }}>
        {/* Roster */}
        <Card padding={0}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(35,43,58,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Users size={16} color={NAVY} />
              <h3 style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Users on Platform</h3>
              <span style={{ marginLeft: "auto", fontSize: 11, color: SLATE, fontWeight: 600 }}>{peers.length}</span>
            </div>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: SLATE }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                style={{
                  width: "100%", padding: "8px 10px 8px 32px", borderRadius: 8,
                  background: T.surface3, border: "1px solid rgba(35,43,58,0.06)",
                  fontSize: 12, color: NAVY, outline: "none",
                }}
              />
            </div>
          </div>

          <div style={{ maxHeight: 480, overflowY: "auto", overscrollBehavior: "contain", padding: "8px 6px" }}>
            {filteredPeers.length === 0 ? (
              <p style={{ padding: 20, textAlign: "center", fontSize: 12, color: SLATE }}>
                No other users on the platform.
              </p>
            ) : (
              filteredPeers.map(peer => (
                <button
                  key={peer.user_id}
                  onClick={() => callState === "idle" && startCall(peer)}
                  disabled={callState !== "idle"}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "10px 12px", borderRadius: 10,
                    background: selectedPeer?.user_id === peer.user_id ? "#EEF1F6" : "transparent",
                    border: "none", textAlign: "left",
                    cursor: callState === "idle" ? "pointer" : "not-allowed",
                    opacity: callState === "idle" ? 1 : 0.5,
                    transition: "background 200ms",
                  }}
                  onMouseEnter={e => { if (callState === "idle") e.currentTarget.style.background = "#F1F4F9"; }}
                  onMouseLeave={e => { if (selectedPeer?.user_id !== peer.user_id) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                    background: peer.role === "admin" ? GOLD : NAVY, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800,
                  }}>
                    {peer.email.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {peer.email}
                    </p>
                    <p style={{ fontSize: 11, color: SLATE }}>
                      {peer.role === "admin" ? "🛡 Admin" : "👤 User"}
                    </p>
                  </div>
                  <Phone size={14} color={TEAL} />
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Call interface */}
        <Card padding={32}>
          {callState === "idle" ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{
                width: 100, height: 100, borderRadius: "50%",
                background: "linear-gradient(135deg, color-mix(in srgb, var(--text-1) 7%, transparent) 0%, color-mix(in srgb, var(--magenta) 13%, transparent) 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 24px",
              }}>
                <Headphones size={42} color={NAVY} strokeWidth={1.5} />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 8 }}>
                Ready to call
              </h2>
              <p style={{ fontSize: 14, color: SLATE, maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>
                Click any user in the roster to start a call. They&apos;ll get a popup to accept. Real WebRTC — no phone lines.
              </p>
              {statusText && <p style={{ marginTop: 12, fontSize: 12, color: SLATE, fontStyle: "italic" }}>{statusText}</p>}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{
                width: 120, height: 120, borderRadius: "50%",
                background: selectedPeer?.role === "admin" ? GOLD : T.midnight, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 38, fontWeight: 900,
                margin: "0 auto 20px",
                boxShadow: "0 12px 40px color-mix(in srgb, var(--midnight) 25%, transparent)",
                animation: callState === "calling" || callState === "ringing-incoming" ? "pulse 1.5s ease-in-out infinite" : "none",
              }}>
                {(selectedPeer?.email || incoming?.fromName || "?").slice(0, 2).toUpperCase()}
              </div>

              <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6 }}>
                {selectedPeer?.email || incoming?.fromName}
              </h2>

              <div style={{ marginBottom: 24 }}>
                {callState === "calling" && <p style={{ fontSize: 14, color: TEAL, fontWeight: 600 }}>📞 {statusText}</p>}
                {callState === "ringing-incoming" && <p style={{ fontSize: 14, color: GOLD, fontWeight: 700 }}>🔔 {statusText}</p>}
                {callState === "connected" && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <Circle size={8} fill="#10B981" color="#10B981" className="animate-pulse" />
                    <span style={{ fontSize: 18, fontWeight: 700, color: NAVY, fontFamily: "var(--font-mono)" }}>
                      {formatDuration(callDuration)}
                    </span>
                  </div>
                )}
              </div>

              {/* Controls */}
              {callState === "ringing-incoming" ? (
                <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
                  <button onClick={rejectIncoming} style={{
                    padding: "14px 28px", borderRadius: 12,
                    background: "#DC2626", color: "#fff", border: "none",
                    fontSize: 14, fontWeight: 800, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 8,
                    boxShadow: "0 8px 24px rgba(220,38,38,0.30)",
                  }}>
                    <PhoneOff size={16} /> Reject
                  </button>
                  <button onClick={acceptIncoming} style={{
                    padding: "14px 28px", borderRadius: 12,
                    background: "#10B981", color: "#fff", border: "none",
                    fontSize: 14, fontWeight: 800, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 8,
                    boxShadow: "0 8px 24px rgba(16,185,129,0.30)",
                  }}>
                    <PhoneIncoming size={16} /> Accept
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
                  <button onClick={toggleMute} disabled={callState !== "connected"} style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: muted ? "#FBEEE8" : "#F1F4F9",
                    border: `1px solid ${muted ? "#E7B8A6" : "rgba(35,43,58,0.08)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: callState === "connected" ? "pointer" : "not-allowed",
                    opacity: callState === "connected" ? 1 : 0.5,
                  }}>
                    {muted ? <MicOff size={20} color="#DC2626" /> : <Mic size={20} color={NAVY} />}
                  </button>
                  <button onClick={hangup} style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: "#DC2626", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "#fff",
                    boxShadow: "0 8px 24px rgba(220,38,38,0.40)",
                  }}>
                    <PhoneOff size={22} />
                  </button>
                </div>
              )}
            </div>
          )}

          <audio ref={remoteAudioRef} autoPlay playsInline />
        </Card>
      </div>

      <div style={{
        padding: "14px 18px", borderRadius: 12,
        background: "linear-gradient(135deg, color-mix(in srgb, var(--text-1) 2%, transparent) 0%, color-mix(in srgb, var(--magenta) 6%, transparent) 100%)",
        border: "1px solid color-mix(in srgb, var(--magenta) 19%, transparent)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <Headphones size={18} color={TEAL} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>How it works</p>
          <p style={{ fontSize: 11, color: SLATE, marginTop: 2, lineHeight: 1.5 }}>
            Both users must have the dialer page open in a browser at the same time. Calls go peer-to-peer over WebRTC (audio only). Signaling uses Supabase Realtime — no phone numbers, no telecom.
          </p>
        </div>
        <Volume2 size={18} color={SLATE} />
      </div>
    </div>
  );
}
