import { redirect } from "next/navigation";

export default function IniciarConversaPage() {
  redirect("/app/inbox?iniciar=1");
}
