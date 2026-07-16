"use client";

import { ComingSoon } from "@/app/_components/ComingSoon";

export default function GoalsPage() {
  return (
    <ComingSoon
      title="Goals"
      purpose="Weekly, monthly and quarterly targets per agent, team, campaign or the company — with live progress tracked against each."
      blockedBy="The goals table is live and ready to accept targets. Progress is measured against the *_day_stats rollups, which nothing populates yet, so a goal set today would read 0% regardless of the work done."
    />
  );
}
