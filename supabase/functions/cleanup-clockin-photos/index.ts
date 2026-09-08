import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'clock-in-photos';
const RETENTION_DAYS = 2;

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Cutoff: any date folder strictly older than RETENTION_DAYS gets deleted.
  // e.g. today is 2026-09-08, cutoff is 2026-09-06 → delete 2026-09-06 and earlier.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  let totalDeleted = 0;
  const errors: string[] = [];

  // List branch-level folders (top level of bucket)
  const { data: branchFolders, error: branchErr } = await supabase.storage
    .from(BUCKET)
    .list('', { limit: 1000 });

  if (branchErr) {
    return new Response(JSON.stringify({ error: branchErr.message }), { status: 500 });
  }

  for (const branch of (branchFolders ?? [])) {
    // List date folders inside this branch folder
    const { data: dateFolders, error: dateErr } = await supabase.storage
      .from(BUCKET)
      .list(branch.name, { limit: 1000 });

    if (dateErr) {
      errors.push(`list ${branch.name}: ${dateErr.message}`);
      continue;
    }

    for (const dateFolder of (dateFolders ?? [])) {
      // Only delete folders whose date is strictly before the cutoff
      if (dateFolder.name >= cutoffStr) continue;

      const prefix = `${branch.name}/${dateFolder.name}`;

      // List all files inside this date folder
      const { data: files, error: filesErr } = await supabase.storage
        .from(BUCKET)
        .list(prefix, { limit: 1000 });

      if (filesErr) {
        errors.push(`list ${prefix}: ${filesErr.message}`);
        continue;
      }

      if (!files || files.length === 0) continue;

      const paths = files.map(f => `${prefix}/${f.name}`);
      const { error: removeErr } = await supabase.storage.from(BUCKET).remove(paths);

      if (removeErr) {
        errors.push(`remove ${prefix}: ${removeErr.message}`);
      } else {
        totalDeleted += paths.length;
      }
    }
  }

  return new Response(
    JSON.stringify({ cutoff: cutoffStr, deleted: totalDeleted, errors }),
    { headers: { 'Content-Type': 'application/json' }, status: 200 },
  );
});
