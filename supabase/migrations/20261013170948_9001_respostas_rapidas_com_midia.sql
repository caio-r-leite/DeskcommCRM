-- manifest: A customização Caio amplia as respostas rápidas com foto ou vídeo, preservando RLS e mantendo o arquivo privado sob a organização; texto continua compatível com as linhas existentes.

alter table public.message_templates
  add column if not exists kind text not null default 'text',
  add column if not exists media_storage_path text,
  add column if not exists media_mime text,
  add column if not exists media_size_bytes bigint,
  add column if not exists media_filename text;

alter table public.message_templates
  drop constraint if exists message_templates_kind_media_check;

alter table public.message_templates
  add constraint message_templates_kind_media_check check (
    (
      kind = 'text'
      and length(btrim(body)) > 0
      and media_storage_path is null
      and media_mime is null
      and media_size_bytes is null
      and media_filename is null
    )
    or
    (
      kind in ('image', 'video')
      and media_storage_path is not null
      and media_storage_path like organization_id::text || '/templates/%'
      and media_mime is not null
      and media_mime like kind || '/%'
      and media_size_bytes > 0
      and media_size_bytes <= 52428800
      and media_filename is not null
      and length(btrim(media_filename)) > 0
    )
  );

comment on column public.message_templates.kind is
  'Tipo da resposta rápida: text, image ou video.';
comment on column public.message_templates.media_storage_path is
  'Caminho privado no bucket whatsapp-media, sempre sob <org>/templates/.';
