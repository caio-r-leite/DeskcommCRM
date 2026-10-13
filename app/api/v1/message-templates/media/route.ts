import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { extFromMime, MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import { createMediaTemplateSchema } from "@/lib/schemas/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLS =
  "id, organization_id, owner_user_id, kind, title, body, shortcut, media_storage_path, media_mime, media_size_bytes, media_filename, created_by_user_id, created_at, updated_at";

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES + 1_048_576) {
    return fail("payload_too_large", t("Arquivo acima de 50MB."), 413, { requestId });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const payload = form?.get("payload");
  if (!(file instanceof File) || typeof payload !== "string") {
    return fail("validation_failed", t("Arquivo e dados do template são obrigatórios."), 422, {
      requestId,
    });
  }

  const raw = (() => {
    try {
      return JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  })();
  const parsed = createMediaTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  if (parsed.data.shared && !roleAtLeast(org.role, "manager")) {
    return fail("forbidden", t("Só manager+ cria template compartilhado."), 403, { requestId });
  }

  const mime = file.type || "application/octet-stream";
  const verdict = validateOutboundMedia(mime, file.size);
  if (!verdict.ok) {
    const status =
      verdict.code === "payload_too_large"
        ? 413
        : verdict.code === "unsupported_media_type"
          ? 415
          : 422;
    return fail(verdict.code, t(verdict.message), status, { requestId });
  }
  if (verdict.kind !== parsed.data.kind) {
    return fail("validation_failed", t("O arquivo não corresponde ao tipo escolhido."), 422, {
      requestId,
    });
  }

  const storagePath = `${org.orgId}/templates/${randomUUID()}.${extFromMime(mime)}`;
  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("whatsapp-media")
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (uploadError) {
    return fail("internal_error", t("Erro ao subir o arquivo."), 500, { requestId });
  }

  const filename =
    file.name
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 255) || `arquivo.${extFromMime(mime)}`;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .insert({
      organization_id: org.orgId,
      owner_user_id: parsed.data.shared ? null : user.id,
      title: parsed.data.title,
      body: parsed.data.body,
      shortcut: parsed.data.shortcut ?? null,
      kind: parsed.data.kind,
      media_storage_path: storagePath,
      media_mime: mime,
      media_size_bytes: buffer.length,
      media_filename: filename,
      created_by_user_id: user.id,
    })
    .select(COLS)
    .single();

  if (error || !data) {
    await admin.storage.from("whatsapp-media").remove([storagePath]);
    return fail("internal_error", t("Erro ao criar template."), 500, { requestId });
  }
  const { error: stepError } = await supabase.from("message_template_steps").insert({
    organization_id: org.orgId,
    template_id: data.id,
    position: 0,
    action_type: parsed.data.kind,
    body: parsed.data.body,
    media_storage_path: storagePath,
    media_mime: mime,
    media_size_bytes: buffer.length,
    media_filename: filename,
  });
  if (stepError) {
    await supabase
      .from("message_templates")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", org.orgId);
    await admin.storage.from("whatsapp-media").remove([storagePath]);
    return fail("internal_error", t("Erro ao criar passo do template."), 500, { requestId });
  }

  void audit({
    action: "template.created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "message_template",
    resourceId: data.id,
    requestId,
    metadata: { shared: parsed.data.shared, title: parsed.data.title, kind: parsed.data.kind },
  });
  return ok(data, { requestId, status: 201 });
}
