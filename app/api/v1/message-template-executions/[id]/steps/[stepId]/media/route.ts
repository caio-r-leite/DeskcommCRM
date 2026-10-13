import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { isTemplateMediaPathOwnedBy } from "@/lib/messaging/media/upload-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const { id, stepId } = await params;
  const supabase = await createClient();
  const { data: execution } = await supabase
    .from("message_template_executions")
    .select("id")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!execution) return fail("not_found", "Execução não encontrada.", 404, { requestId });
  const { data: step } = await supabase
    .from("message_template_execution_steps")
    .select("payload")
    .eq("id", stepId)
    .eq("execution_id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const payload = step?.payload as
    | {
        media_storage_path?: string;
        media_mime?: string;
        media_filename?: string;
        media_size_bytes?: number;
      }
    | undefined;
  if (
    !payload?.media_storage_path ||
    !payload.media_mime ||
    !isTemplateMediaPathOwnedBy(payload.media_storage_path, authz.org.orgId)
  )
    return fail("not_found", "Arquivo não encontrado.", 404, { requestId });
  const { data: blob } = await createAdminClient()
    .storage.from("whatsapp-media")
    .download(payload.media_storage_path);
  if (!blob) return fail("not_found", "Arquivo não encontrado.", 404, { requestId });
  return new Response(blob, {
    headers: {
      "Content-Type": payload.media_mime,
      "Content-Length": String(payload.media_size_bytes ?? blob.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(payload.media_filename ?? "arquivo")}`,
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
    },
  });
}
