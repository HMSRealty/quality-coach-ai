"use client";

import { ComingSoon } from "@/app/_components/ComingSoon";

export default function ActionPlansPage() {
  return (
    <ComingSoon
      title="Action Plans"
      purpose="Fully automatic. Python forecasts whether each agent will hit their weekly target; two consecutive weeks statistically unlikely and they are enrolled, and removed again once they recover. Managers never assign these by hand."
      blockedBy="Reads action_plans and action_plan_events. The forecasting model is part of the analytics worker and is not built yet. Because this decides whether a real person goes on a performance plan, every enrollment must store the window, counts and probability that produced it — so the agent can be shown exactly why. That evidence trail is designed but unimplemented, and shipping the feature without it would be indefensible."
    />
  );
}
