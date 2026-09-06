import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { checkBasicAuth } from "@/lib/auth";
import AdminDashboard from "./AdminDashboard";

// Enforce auth at the page boundary even if Proxy is bypassed by transport variants.
export default async function AdminPage() {
  const auth = (await headers()).get("authorization");
  if (!checkBasicAuth(auth, process.env.ADMIN_BASIC_AUTH).ok) notFound();
  return <AdminDashboard />;
}
