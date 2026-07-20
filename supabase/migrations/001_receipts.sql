create extension if not exists "pgcrypto";

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_date date,
  purchase_time time,
  merchant_name text not null default '',
  total_amount integer not null default 0,
  subtotal_amount integer,
  tax_8_base integer not null default 0,
  tax_8_amount integer not null default 0,
  tax_10_base integer not null default 0,
  tax_10_amount integer not null default 0,
  total_tax_amount integer not null default 0,
  currency text not null default 'JPY' check (currency = 'JPY'),
  notes text,
  image_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  unit_price integer,
  amount integer not null default 0,
  tax_rate integer not null default 0 check (tax_rate in (0, 8, 10)),
  created_at timestamptz not null default now()
);

create index if not exists receipts_purchase_date_idx on public.receipts(purchase_date desc);
create index if not exists receipt_items_receipt_id_idx on public.receipt_items(receipt_id);

alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipt-images',
  'receipt-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public reads are intentional because the requirement calls for persistent public image URLs.
-- Writes and database access happen only through the server-side service role.
create policy "Public receipt images are readable"
on storage.objects for select
using (bucket_id = 'receipt-images');
