"use client";

import { ComingSoon } from "@/app/_components/ComingSoon";

export default function CampaignAnalyticsPage() {
  return (
    <ComingSoon
      title="Campaign Analytics"
      purpose="Per campaign: connection rate, contact rate, lead rate, appointment rate, QA score, conversion trend, best and worst agent."
      blockedBy="Every rate here needs calls as the denominator. Your dialer's webhook posts lead submissions only — 12 contact fields, no disposition, no call id, no timestamp — so calls that produced nothing were never recorded. The denominator will come from the scheduled Readymode Research Calls sync in the analytics worker. Until that lands these rates cannot be computed honestly, and estimating them would be inventing them."
    />
  );
}
