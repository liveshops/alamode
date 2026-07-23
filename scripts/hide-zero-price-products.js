/**
 * Hide products with price = 0 (scraper gave null prices; see ASOS July 2026).
 * Sets is_available = false in batches. Next successful scrape run restores
 * them automatically (sync updates set is_available = true with a real price).
 *
 * Usage: node scripts/hide-zero-price-products.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH = 200;

async function main() {
  let totalHidden = 0;

  for (;;) {
    const { data: rows, error: selErr } = await supabase
      .from('products')
      .select('id')
      .eq('price', 0)
      .eq('is_available', true)
      .limit(BATCH);
    if (selErr) throw selErr;
    if (!rows || rows.length === 0) break;

    const ids = rows.map(r => r.id);
    const { error: updErr } = await supabase
      .from('products')
      .update({ is_available: false })
      .in('id', ids);
    if (updErr) throw updErr;

    totalHidden += ids.length;
    process.stdout.write(`\rHidden: ${totalHidden}`);
  }

  console.log(`\nDone. Hidden ${totalHidden} zero-price products.`);

  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('price', 0)
    .eq('is_available', true);
  console.log('Remaining visible zero-price products:', count);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
