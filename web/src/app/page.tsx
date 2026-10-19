import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { homeForRole } from "@/lib/claims";

export default async function Home() {
  const viewer = await getViewer();
  redirect(viewer ? homeForRole(viewer.role) : "/login");
}
