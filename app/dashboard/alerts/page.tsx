"use client";

import { ComingSoon } from "@/app/_components/ComingSoon";

export default function AlertsPage() {
  return (
    <ComingSoon
      title="Smart Alerts"
      purpose='Alerts Python raises on its own — "Ahmed produced no leads for 4 days", "Solar campaign conversion dropped 18%", "Team Alpha exceeded target". Each one carries the numbers behind it, so an alert can always show its work.'
      blockedBy="Reads the alerts table, written by the rollup pass in the analytics worker. No AI is involved in raising these — they are threshold rules over the rollups."
    />
  );
}
