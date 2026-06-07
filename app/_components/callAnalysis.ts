// Pure helpers for the Call Intelligence Hub. No React — easy to unit-test and
// share across the player, transcript, compliance timeline, and scorecard.

export type Speaker = "agent" | "seller" | "other";

export interface Segment {
  speaker: Speaker;
  time: string | null;   // raw "MM:SS" label if present
  start: number;         // seconds
  end: number;           // seconds (estimated from next segment / word count)
  text: string;
  words: number;
}

const SPEAK_RE = /^(agent|caller|rep|closer|seller|owner|prospect|homeowner|customer)\s*[:\-–]\s*/i;
const TIME_RE = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/;

function toSec(m: RegExpMatchArray | null): number | null {
  if (!m) return null;
  if (m[3] != null) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
  return (+m[1]) * 60 + (+m[2]);
}

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

// Parse the diarized transcript into timed segments with estimated end times.
export function parseSegments(raw: string | null | undefined): Segment[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const segs: Segment[] = [];
  for (const line of lines) {
    const tm = line.match(TIME_RE);
    const start = toSec(tm);
    let body = line.replace(TIME_RE, "").trim();
    let speaker: Speaker = "other";
    const sm = body.match(SPEAK_RE);
    if (sm) {
      const who = sm[1].toLowerCase();
      speaker = /agent|caller|rep|closer/.test(who) ? "agent" : "seller";
      body = body.slice(sm[0].length).trim();
    }
    if (!body) continue;
    segs.push({ speaker, time: tm ? `${tm[1]}:${tm[2]}` : null, start: start ?? -1, end: -1, text: body, words: wordCount(body) });
  }
  // Fill in start/end. If timestamps are missing, synthesize a timeline using a
  // speaking rate of ~2.6 words/sec.
  let cursor = 0;
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].start < 0) segs[i].start = cursor;
    const next = segs.slice(i + 1).find((s) => s.start >= 0);
    const estDur = Math.max(1.2, segs[i].words / 2.6);
    segs[i].end = next ? Math.max(segs[i].start + 0.8, next.start) : segs[i].start + estDur;
    cursor = segs[i].end;
  }
  return segs;
}

// ── Behavioral metrics ────────────────────────────────────────────────
export interface Behavior {
  talkRatio: number;      // 0..1  agent share of words
  agentWords: number;
  sellerWords: number;
  agentWpm: number;
  sellerWpm: number;
  totalSeconds: number;
}

export function computeBehavior(segs: Segment[]): Behavior {
  let agentWords = 0, sellerWords = 0, agentSec = 0, sellerSec = 0;
  for (const s of segs) {
    const dur = Math.max(0, s.end - s.start);
    if (s.speaker === "agent") { agentWords += s.words; agentSec += dur; }
    else if (s.speaker === "seller") { sellerWords += s.words; sellerSec += dur; }
  }
  const totalWords = agentWords + sellerWords;
  const last = segs.length ? segs[segs.length - 1].end : 0;
  return {
    talkRatio: totalWords ? agentWords / totalWords : 0.5,
    agentWords, sellerWords,
    agentWpm: agentSec > 0 ? Math.round(agentWords / (agentSec / 60)) : 0,
    sellerWpm: sellerSec > 0 ? Math.round(sellerWords / (sellerSec / 60)) : 0,
    totalSeconds: last,
  };
}

// ── TCPA / hostility shield ───────────────────────────────────────────
export interface RiskHit {
  phrase: string;
  category: "tcpa" | "hostile" | "profanity";
  time: string | null;
  start: number;
  excerpt: string;
}

const RISK_PATTERNS: { re: RegExp; label: string; category: RiskHit["category"] }[] = [
  { re: /\blawyer\b|\battorney\b/i, label: "Lawyer / attorney", category: "tcpa" },
  { re: /remove me from your list|take me off (your|the) list|off your list/i, label: "Remove from list", category: "tcpa" },
  { re: /\bd\.?n\.?c\.?\b|do not call|don'?t call me/i, label: "Do Not Call", category: "tcpa" },
  { re: /\bsue\b|\bharass(ing|ment)?\b|report you|\bFTC\b|\bFCC\b/i, label: "Legal threat", category: "tcpa" },
  { re: /\bf+u+c+k|\bs+h+i+t\b|\basshole\b|\bbastard\b|\bbitch\b/i, label: "Profanity", category: "profanity" },
  { re: /stop calling|never call|leave me alone|how did you get my number/i, label: "Hostility", category: "hostile" },
];

export function detectRisk(segs: Segment[]): RiskHit[] {
  const hits: RiskHit[] = [];
  for (const s of segs) {
    for (const p of RISK_PATTERNS) {
      const m = s.text.match(p.re);
      if (m) {
        const idx = m.index ?? 0;
        hits.push({
          phrase: p.label, category: p.category, time: s.time, start: s.start,
          excerpt: s.text.slice(Math.max(0, idx - 24), idx + (m[0].length) + 36).trim(),
        });
        break; // one hit per segment is enough
      }
    }
  }
  return hits;
}

// ── Script-compliance heuristic ───────────────────────────────────────
export type ComplianceStatus = "compliant" | "improvised" | "failed";
export interface ComplianceMark {
  stage: string;
  status: ComplianceStatus;
  time: string | null;
  start: number;
  detail: string;
}

// Canonical cold-call script checkpoints. We scan agent lines for evidence of
// each stage; present + on-keyword = compliant, present but loosely = improvised,
// absent = failed (skipped qualifying question).
const SCRIPT_STAGES: { stage: string; keywords: RegExp; soft: RegExp }[] = [
  { stage: "Intro & permission", keywords: /my name is|calling from|reaching out|do you have (a )?(quick )?(minute|moment|second)/i, soft: /\bhi\b|\bhello\b|how are you/i },
  { stage: "Reason for call", keywords: /reason (for|i'?m) calling|calling about|interested in (buying|your)|your (property|house|home) (at|on)/i, soft: /property|house|home/i },
  { stage: "Motivation", keywords: /why (are you|would you).*sell|reason for selling|what'?s prompting|looking to sell/i, soft: /\bsell\b|\bselling\b/i },
  { stage: "Condition", keywords: /condition|repairs?|roof|foundation|hvac|updates?|renovat/i, soft: /\bfix\b|\bwork\b/i },
  { stage: "Price expectation", keywords: /asking price|how much.*looking|price.*in mind|what.*number|what would you take/i, soft: /\bprice\b|\bworth\b|\$/i },
  { stage: "Timeline", keywords: /how soon|time ?line|when (are|would) you.*(sell|move|close)|by when/i, soft: /\bsoon\b|\bmonth\b|\bweek\b/i },
  { stage: "Next step / close", keywords: /next step|send (you )?an offer|schedule|follow up|set (up )?a (time|call)|appointment/i, soft: /\bcall\b|\bemail\b|\boffer\b/i },
];

export function deriveCompliance(segs: Segment[]): ComplianceMark[] {
  const agentText = segs.filter((s) => s.speaker === "agent");
  return SCRIPT_STAGES.map(({ stage, keywords, soft }) => {
    const hard = agentText.find((s) => keywords.test(s.text));
    if (hard) return { stage, status: "compliant" as const, time: hard.time, start: hard.start, detail: hard.text.slice(0, 120) };
    const looseSeg = agentText.find((s) => soft.test(s.text));
    if (looseSeg) return { stage, status: "improvised" as const, time: looseSeg.time, start: looseSeg.start, detail: looseSeg.text.slice(0, 120) };
    return { stage, status: "failed" as const, time: null, start: -1, detail: "Not covered on the call." };
  });
}

export const fmtClock = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
};
