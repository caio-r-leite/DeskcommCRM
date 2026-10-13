import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { isTemplateMediaPathOwnedBy } from "@/lib/messaging/media/upload-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  const supabase = await createClient();
  const { data: template, error } = await supabase
    .from("message_templates")
    .select("media_storage_path, media_mime, media_size_bytes, media_filename")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", t("Erro ao carregar arquivo."), 500, { requestId });
  if (!template?.media_storage_path || !template.media_mime) {
    return fail("not_found", t("Arquivo não encontrado."), 404, { requestId });
  }

  if (!isTemplateMediaPathOwnedBy(template.media_storage_path, authz.org.orgId)) {
    return fail("forbidden", t("Arquivo fora da organização ativa."), 403, { requestId });
  }

  const { data: blob, error: downloadError } = await createAdminClient()
    .storage.from("whatsapp-media")
    .download(template.media_storage_path);
  if (downloadError || !blob) {
    return fail("not_found", t("Arquivo não encontrado."), 404, { requestId });
  }

  const filename = encodeURIComponent(template.media_filename || "arquivo");
  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": template.media_mime,
      "Content-Length": String(template.media_size_bytes ?? blob.size),
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
    },
  });
}
