// The proxy redirects "/" to /login or the user's role home; this is only a fallback.
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login");
}
