alter table public.receipts
add column if not exists image_urls text[] not null default '{}';

update public.receipts
set image_urls = array[image_url]
where cardinality(image_urls) = 0 and image_url <> '';
