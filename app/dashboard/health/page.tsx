"use client";

import { ComingSoon } from "@/app/_components/ComingSoon";

export default function CompanyHealthPage() {
  return (
    <ComingSoon
      title="Company Health"
      purpose="One overall health score with its components broken out — productivity, goal achievement, QA, lead production, campaign performance, team performance — and how each moved."
      blockedBy="Reads org_day_stats.health_score and health_components. The columns exist; the analytics worker that computes them does not."
    />
  );
}
