import { redirect } from "next/navigation";

export default function NgojekRedirectPage() {
  redirect("/customer?tab=ngojek");
}
