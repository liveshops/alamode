/**
 * Read-only probe: fingerprint which get_recommendations version is live.
 * Tests: (1) not-interested exclusion, (2) impression cooldown exclusion,
 * (3) reason strings, (4) seed determinism.
 *
 * Usage: node scripts/probe-live-recommendations.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // 1. Pick a test user who follows other users (needed to verify social signal)
  const { data: follows, error: fErr } = await supabase
    .from('user_follows_users')
    .select('follower_id, following_id')
    .limit(2000);
  if (fErr) console.log('user_follows_users error:', fErr.message);

  const followingByUser = new Map();
  for (const row of follows || []) {
    if (!followingByUser.has(row.follower_id)) followingByUser.set(row.follower_id, []);
    followingByUser.get(row.follower_id).push(row.following_id);
  }
  let testUser = null, followedIds = [];
  for (const [uid, list] of followingByUser) {
    if (list.length > followedIds.length) { testUser = uid; followedIds = list; }
  }
  if (!testUser) {
    const { data: likers } = await supabase
      .from('user_likes_products').select('user_id').limit(1);
    testUser = likers?.[0]?.user_id;
  }
  console.log(`Test user: ${testUser} (follows ${followedIds.length} users)`);

  // Not-interested set for this user
  const { data: niRows } = await supabase
    .from('user_not_interested')
    .select('product_id')
    .eq('user_id', testUser);
  const niSet = new Set((niRows || []).map(r => r.product_id));
  console.log(`Not-interested entries: ${niSet.size}`);

  // Friends' liked products (the social signal source of truth)
  let friendLikeCounts = new Map();
  if (followedIds.length > 0) {
    const { data: fl } = await supabase
      .from('user_likes_products')
      .select('product_id')
      .in('user_id', followedIds)
      .limit(5000);
    for (const r of fl || []) {
      friendLikeCounts.set(r.product_id, (friendLikeCounts.get(r.product_id) || 0) + 1);
    }
  }
  console.log(`Distinct products liked by followed users: ${friendLikeCounts.size}`);

  // The user's "known brands": brands of products they liked + brands they follow.
  // Used to verify explore slots hold brand-novel products (mirrors is_explore in SQL).
  const knownBrands = new Set();
  const { data: ownLikes } = await supabase
    .from('user_likes_products')
    .select('product_id, products(brand_id)')
    .eq('user_id', testUser)
    .limit(1000);
  for (const r of ownLikes || []) {
    if (r.products?.brand_id) knownBrands.add(r.products.brand_id);
  }
  const { data: ownBrandFollows } = await supabase
    .from('user_follows_brands')
    .select('brand_id')
    .eq('user_id', testUser);
  for (const r of ownBrandFollows || []) knownBrands.add(r.brand_id);
  console.log(`Known brands (liked or followed): ${knownBrands.size}`);

  // 2. Recent impressions for this user (last 6 days)
  const since = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString();
  const { data: imps, error: impErr } = await supabase
    .from('user_product_impressions')
    .select('product_id, last_shown_at')
    .eq('user_id', testUser)
    .gte('last_shown_at', since)
    .limit(1000);
  if (impErr) console.log('impressions error:', impErr.message);
  const impSet = new Set((imps || []).map(r => r.product_id));
  console.log(`Recent impressions (6d): ${impSet.size}`);

  // 3. Call get_recommendations with fixed seed, big page
  const t0 = Date.now();
  const { data: recs, error: recErr } = await supabase.rpc('get_recommendations', {
    target_user_id: testUser,
    result_limit: 100,
    offset_val: 0,
    refresh_seed: 42,
  });
  const elapsed = Date.now() - t0;
  if (recErr) { console.error('RPC error:', recErr); return; }
  console.log(`\nget_recommendations returned ${recs.length} rows in ${elapsed}ms`);
  console.log('Columns:', Object.keys(recs[0] || {}).join(', '));

  const recIds = recs.map(r => r.product_id);
  const niHits = recIds.filter(id => niSet.has(id));
  const impHits = recIds.filter(id => impSet.has(id));
  console.log(`\nNot-interested products in results: ${niHits.length} ${niHits.length ? '❌ (NOT excluded)' : '✅ (excluded)'}`);
  console.log(`Recently-impressed products in results: ${impHits.length}/${recIds.length} ${impHits.length > recIds.length * 0.3 ? '❌ (no cooldown)' : '✅-ish'}`);

  // Reason string distribution
  const reasons = {};
  for (const r of recs) reasons[r.recommendation_reason] = (reasons[r.recommendation_reason] || 0) + 1;
  console.log('\nReason distribution:', reasons);

  // V2: social signal verification
  const socialInResults = recIds.filter(id => friendLikeCounts.has(id));
  const socialReasons = recs.filter(r => /you follow/.test(r.recommendation_reason || ''));
  console.log(`\n[v2] Friend-liked products in results: ${socialInResults.length}`);
  console.log(`[v2] Results with social reason string: ${socialReasons.length}`);
  if (socialReasons.length) {
    console.log('     e.g.', socialReasons.slice(0, 3).map(r => `"${r.name}" → ${r.recommendation_reason}`).join(' | '));
  }

  // V2: explore slot verification (positions 7, 14, 21… should hold brand-novel products:
  // brand never liked/followed by the user, product not directly liked by friends)
  const isBrandNovel = (r) => !knownBrands.has(r.brand_id) && !friendLikeCounts.has(r.product_id);
  const exploreSlots = [6, 13, 20, 27, 34, 41, 48, 55, 62, 69, 76, 83, 90, 97].filter(i => i < recs.length);
  const exploreHits = exploreSlots.filter(i => isBrandNovel(recs[i]));
  console.log(`[v2] Explore slots (7th positions) holding brand-novel items: ${exploreHits.length}/${exploreSlots.length}`);
  const novelCount = recs.filter(isBrandNovel).length;
  console.log(`[v2] Total brand-novel share of feed: ${novelCount}/${recs.length}`);

  // Brand diversity
  const brands = {};
  for (const r of recs) brands[r.brand_name] = (brands[r.brand_name] || 0) + 1;
  const maxPerBrand = Math.max(...Object.values(brands));
  console.log(`Distinct brands in 100 results: ${Object.keys(brands).length}, max per brand: ${maxPerBrand}`);

  // 4. Determinism with same seed
  const { data: recs2 } = await supabase.rpc('get_recommendations', {
    target_user_id: testUser,
    result_limit: 100,
    offset_val: 0,
    refresh_seed: 42,
  });
  const same = recs2 && recs2.length === recs.length && recs2.every((r, i) => r.product_id === recs[i].product_id);
  console.log(`Same seed → identical results: ${same ? 'yes (deterministic)' : 'NO'}`);

  // 5. user_preferences staleness column check (Apr version added updated_at refresh logic)
  const { data: prefs, error: prefErr } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', testUser)
    .maybeSingle();
  if (prefErr) console.log('user_preferences error:', prefErr.message);
  else if (prefs) {
    console.log('\nuser_preferences columns:', Object.keys(prefs).join(', '));
    console.log('prefs updated_at:', prefs.updated_at, '| total_likes:', prefs.total_likes, '| total_follows:', prefs.total_follows);
  } else {
    console.log('\nNo user_preferences row for test user');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
