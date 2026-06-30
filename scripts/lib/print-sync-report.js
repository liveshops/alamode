/**
 * Shared "APIFY SYNC COMPLETE - FINAL REPORT" printer.
 *
 * Used by:
 *   - scripts/sync-all-apify-brands.js  (live, printed at the end of a sync)
 *   - scripts/sync-report.js            (`npm run sync-report`, rebuilt from the DB)
 *
 * Keeping the formatting here means the on-demand report is byte-for-byte
 * identical to the one printed at the end of a real sync.
 *
 * @param {Array<{brand,slug,success,added,updated,deleted,time,total}>} results
 * @param {{elapsedSeconds?:number, reportDate?:Date}} opts
 * @returns {{totalAdded,totalUpdated,totalDeleted,grandTotal,successful,failed}}
 */
function printSyncReport(results, { elapsedSeconds = 0, reportDate = new Date() } = {}) {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  const totalAdded = results.reduce((sum, r) => sum + (r.added || 0), 0);
  const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0);
  const totalDeleted = results.reduce((sum, r) => sum + (r.deleted || 0), 0);
  const grandTotal = results.reduce((sum, r) => sum + (r.total || 0), 0);
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n' + '='.repeat(90));
  console.log('🎉 APIFY SYNC COMPLETE - FINAL REPORT');
  console.log('='.repeat(90));

  console.log(`\n📅 ${reportDate.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`);
  console.log(`⏱️  Total time: ${minutes}m ${seconds}s`);
  console.log(`\n📊 Overall Statistics:`);
  console.log(`   ✅ Brands successful: ${successful}`);
  console.log(`   ❌ Brands failed: ${failed}`);
  console.log(`   ➕ Total products added: ${totalAdded}`);
  console.log(`   🔄 Total products updated: ${totalUpdated}`);
  console.log(`   🗑️  Total products deleted: ${totalDeleted}`);
  console.log(`   📦 Total products in database: ${grandTotal}`);

  console.log(`\n${'─'.repeat(90)}`);
  console.log('📋 Brand-by-Brand Breakdown:');
  console.log('─'.repeat(90));
  console.log(`${'Brand'.padEnd(25)} ${'Status'.padEnd(8)} ${'Added'.padEnd(7)} ${'Updated'.padEnd(9)} ${'Deleted'.padEnd(9)} ${'Total'.padEnd(8)} ${'Time'.padEnd(6)}`);
  console.log('─'.repeat(90));

  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const brandName = r.brand.length > 23 ? r.brand.substring(0, 20) + '...' : r.brand;
    console.log(
      `${brandName.padEnd(25)} ${status.padEnd(8)} ${String(r.added || 0).padEnd(7)} ${String(r.updated || 0).padEnd(9)} ${String(r.deleted || 0).padEnd(9)} ${String(r.total || 0).padEnd(8)} ${r.time || 0}s`
    );
  });

  console.log('─'.repeat(90));
  console.log(
    `${'TOTAL'.padEnd(25)} ${' '.padEnd(8)} ${String(totalAdded).padEnd(7)} ${String(totalUpdated).padEnd(9)} ${String(totalDeleted).padEnd(9)} ${String(grandTotal).padEnd(8)}`
  );

  if (failed > 0) {
    console.log(`\n⚠️  Failed brands:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.brand} (${r.slug})`);
    });
  }

  console.log('\n' + '='.repeat(70) + '\n');

  return { totalAdded, totalUpdated, totalDeleted, grandTotal, successful, failed };
}

module.exports = { printSyncReport };
