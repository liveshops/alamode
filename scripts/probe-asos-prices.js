/**
 * Investigate zero-price ASOS products: inspect the latest Apify dataset
 * and classify how prices appear in the raw scrape data.
 *
 * Usage: node scripts/probe-asos-prices.js
 */
require('dotenv').config();

const TIMEOUT_MS = 120000;
setTimeout(() => { console.log('TIMED OUT'); process.exit(1); }, TIMEOUT_MS);

async function main() {
  const token = process.env.APIFY_API_TOKEN;

  // 1. Latest run of the ASOS task
  const runRes = await fetch(
    `https://api.apify.com/v2/actor-tasks/tropical_infinity~e-commerce-scraping-tool-asos/runs/last?token=${token}`
  );
  const run = (await runRes.json()).data;
  console.log('Latest run:', run.status, '| dataset:', run.defaultDatasetId, '| finished:', run.finishedAt);

  // 2. Fetch items in small pages to avoid huge payloads
  const PAGE = 250;
  const PAGES = 4; // 1000 items total
  let items = [];
  for (let i = 0; i < PAGES; i++) {
    const url = `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${token}&limit=${PAGE}&offset=${i * PAGE}`;
    const res = await fetch(url);
    if (!res.ok) { console.log('Fetch error at page', i, res.status); break; }
    const page = await res.json();
    items = items.concat(page);
    if (page.length < PAGE) break;
  }
  console.log('Fetched', items.length, 'items');

  // 3. Classify how offers/price appears
  let noOffers = 0, offersArray = 0, priceOk = 0, priceMissing = 0;
  let arrayExample = null, missingExample = null;
  for (const it of items) {
    const o = it.offers;
    if (!o) { noOffers++; continue; }
    if (Array.isArray(o)) { offersArray++; if (!arrayExample) arrayExample = it; continue; }
    const p = parseFloat(o.price ?? it.price ?? 0);
    if (p > 0) priceOk++;
    else { priceMissing++; if (!missingExample) missingExample = it; }
  }
  console.log('\noffers field breakdown:');
  console.log('  missing offers        :', noOffers);
  console.log('  offers is ARRAY       :', offersArray, '(transform reads offers.price -> undefined -> 0!)');
  console.log('  object, price > 0     :', priceOk);
  console.log('  object, no usable price:', priceMissing);

  const show = (label, it) => {
    console.log(`\n--- ${label} ---`);
    console.log('name:', it.name);
    console.log('url:', (it.url || '').slice(0, 90));
    console.log('offers:', JSON.stringify(it.offers).slice(0, 600));
    console.log('top-level price:', it.price);
  };
  if (arrayExample) show('Example: offers is an ARRAY', arrayExample);
  if (missingExample) show('Example: offers object without price', missingExample);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
