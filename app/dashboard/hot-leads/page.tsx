"use client";

import { ComingSoon } from "@/app/_components/ComingSoon";

export default function HotLeadsPage() {
  return (
    <ComingSoon
      title="Hot Leads"
      purpose="Leads Python scored hot, ranked by score, each with the exact components that produced it — interested +20, asked timeline +15, positive sentiment +20 — and an AI explanation of why it is likely to close."
      blockedBy="Reads leads_v2 joined to lead_scores. Scoring runs in the analytics worker: the AI extracts signals (interested? asked about timeline?) and Python does the arithmetic over them. Neither half runs yet."
    />
  );
}
