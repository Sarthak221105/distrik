import { redirect } from "next/navigation";

export default function SystemHome() {
  redirect("/system/health");
}
