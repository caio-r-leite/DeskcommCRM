import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { isTemplateMediaPathOwnedBy } from "@/lib/messaging/media/upload-validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const position = Number(form?.get("position"));
  const body = String(form?.get("body") ?? "").slice(0, 4096);
  if (
    !(file instanceof File) ||
    !Number.isInteger(position) ||
    position < 0 ||
    file.size < 1 ||
    file.size > MAX_MEDIA_BYTES
  )
    return fail("validation_failed", "Arquivo ou posição inválida.", 422, { requestId });
  const actionType = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : null;
  if (!actionType) return fail("validation_failed", "Use uma foto ou vídeo.", 422, { requestId });
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("message_templates")
    .select("id")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!template) return fail("not_found", "Roteiro não encontrado.", 404, { requestId });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "arquivo";
  const storagePath = `${authz.org.orgId}/templates/${id}/${randomUUID()}-${safeName}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("whatsapp-media")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) return fail("internal_error", "Erro ao guardar arquivo.", 500, { requestId });
  const { data, error } = await supabase
    .from("message_template_steps")
    .insert({
      organization_id: authz.org.orgId,
      template_id: id,
      position,
      action_type: actionType,
      body,
      media_storage_path: storagePath,
      media_mime: file.type,
      media_size_bytes: file.size,
      media_filename: file.name,
    })
    .select("id")
    .single();
  if (error || !data) {
    await admin.storage.from("whatsapp-media").remove([storagePath]);
    return fail("internal_error", "Erro ao salvar passo de mídia.", 500, { requestId });
  }
  return ok(data, { requestId, status: 201 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const stepId = req.nextUrl.searchParams.get("step_id");
  if (!stepId) return fail("validation_failed", "Passo obrigatório.", 422, { requestId });

  const supabase = await createClient();
  const { data: step, error } = await supabase
    .from("message_template_steps")
    .select("media_storage_path, media_mime, media_size_bytes, media_filename")
    .eq("id", stepId)
    .eq("template_id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (
    error ||
    !step?.media_storage_path ||
    !step.media_mime ||
    !isTemplateMediaPathOwnedBy(step.media_storage_path, authz.org.orgId)
  ) {
    return fail("not_found", "Arquivo não encontrado.", 404, { requestId });
  }
  const { data: blob, error: downloadError } = await createAdminClient()
    .storage.from("whatsapp-media")
    .download(step.media_storage_path);
  if (downloadError || !blob) {
    return fail("not_found", "Arquivo não encontrado.", 404, { requestId });
  }
  return new Response(blob, {
    headers: {
      "Content-Type": step.media_mime,
      "Content-Length": String(step.media_size_bytes ?? blob.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(step.media_filename ?? "arquivo")}`,
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
    },
  });
}
