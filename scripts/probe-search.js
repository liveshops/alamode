/**
 * Verify the search_products RPC returns relevant results.
 * Checks: precision for 'jeans' across all three sorts, latency, synonym expansion.
 *
 * Usage: node scripts/probe-search.js [query]
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RELEVANT = /jean|denim/i;

async function runSort(query, sort, since) {
  const t0 = Date.now();
  const { data, error } = await supabase.rpc('search_products', {
    p_query: query,
    p_user_id: null,
    p_sort: sort,
    p_brand_ids: null,
    p_since: since ?? null,
    p_limit: 20,
    p_offset: 0,
  });
  const ms = Date.now() - t0;
  if (error) { console.error(`[${sort}] RPC error:`, error.message); return; }

  const relevant = data.filter(r => RELEVANT.test(`${r.name} ${r.taxonomy_category_name || ''}`));
  console.log(`\n[${sort}] ${data.length} results in ${ms}ms — ${relevant.length}/${data.length} name/category-relevant`);
  data.slice(0, 8).forEach((r, i) => {
    const flag = RELEVANT.test(`${r.name} ${r.taxonomy_category_name || ''}`) ? '✅' : '⚠️ ';
    console.log(`  ${i + 1}. ${flag} ${r.name} [${r.taxonomy_category_name || 'no category'}] rel=${Number(r.relevance).toFixed(3)} likes=${r.like_count}`);
  });
}

async function main() {
  const query = process.argv[2] || 'jeans or denim';
  console.log(`Query: "${query}"`);

  await runSort(query, 'relevance');
  await runSort(query, 'newest');
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  await runSort(query, 'most_liked', since);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
