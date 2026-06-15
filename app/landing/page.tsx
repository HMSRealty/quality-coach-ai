// Legacy /landing route — the canonical landing now lives at /.
// Anyone who lands here gets bounced over so we have one source of truth.
import { redirect } from "next/navigation";

export default function LegacyLandingRedirect() {
  redirect("/");
}
