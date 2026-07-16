"use client";

import { ComingSoon } from "@/app/_components/ComingSoon";

export default function ExecutivePage() {
  return (
    <ComingSoon
      title="Executive Dashboard"
      purpose="Calls and leads for today, this week and this month; weekly and monthly target progress; company health; team and campaign rankings; best and lowest agent; hot leads; open action plans."
      blockedBy="Every figure here reads from the *_day_stats rollups, which the analytics worker populates. The tables exist and are live; nothing writes to them yet."
    />
  );
}
