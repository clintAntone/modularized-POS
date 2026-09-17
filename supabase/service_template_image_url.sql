-- Add image_url column to service_templates
ALTER TABLE service_templates ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create storage bucket for service images (run once)
-- insert into storage.buckets (id, name, public) values ('service-images', 'service-images', true)
-- on conflict (id) do nothing;

-- RLS policy for public read
-- create policy "Public read service images"
--   on storage.objects for select using (bucket_id = 'service-images');

-- RLS policy for authenticated write (anon key with service role for admin uploads)
-- create policy "Service images upload"
--   on storage.objects for insert with check (bucket_id = 'service-images');
