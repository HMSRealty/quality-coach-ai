import { redirect } from "next/navigation";

export default function CallSettingsRemoved() {
  redirect("/dashboard/settings");
}
