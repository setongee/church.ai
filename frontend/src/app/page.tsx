import { redirect } from "next/navigation";

// The dashboard is the entry point for everyone; services live at /services.
export default function Home() {
  redirect("/dashboard");
}
