// Script to set up test user (klshumway) with brand follows
// Run with: node scripts/setup-test-user.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.log('\n❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  console.log('Add it to your .env file from Supabase Dashboard → Settings → API');
  process.exit(1);
}

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  serviceRoleKey
);

async function setupTestUser() {
  console.log('🔄 Setting up test user...\n');
  
  try {
    // Find the test user by username
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', 'klshumway')
      .single();
    
    if (userError || !user) {
      console.log('❌ Could not find user with username "klshumway"');
      console.log('   Make sure you created this user in Supabase Dashboard → Authentication');
      return;
    }
    
    console.log(`✅ Found user: ${user.display_name} (@${user.username})`);
    console.log(`   User ID: ${user.id}\n`);
    
    // Get all brands
    const { data: brands } = await supabase
      .from('brands')
      .select('id, name, slug');
    
    console.log(`Found ${brands.length} brands\n`);
    
    // Follow some brands (let's follow Free People, REVOLVE, and Motel Rocks)
    const brandsToFollow = ['free-people', 'revolve', 'motel'];
    
    console.log('Adding brand follows...');
    for (const slug of brandsToFollow) {
      const brand = brands.find(b => b.slug === slug);
      if (!brand) continue;
      
      const { error } = await supabase
        .from('user_follows_brands')
        .upsert({
          user_id: user.id,
          brand_id: brand.id
        }, {
          onConflict: 'user_id,brand_id'
        });
      
      if (error) {
        console.log(`⚠️  Could not follow ${brand.name}:`, error.message);
      } else {
        console.log(`✅ Following: ${brand.name}`);
      }
    }
    
    // Check the user's feed
    console.log('\n📊 Checking user feed...');
    const { data: feedProducts } = await supabase
      .from('products')
      .select(`
        *,
        brands:brand_id(name, slug)
      `)
      .in('brand_id', brands
        .filter(b => brandsToFollow.includes(b.slug))
        .map(b => b.id)
      )
      .limit(10);
    
    console.log(`   User's feed has ${feedProducts?.length || 0} products`);
    
    if (feedProducts && feedProducts.length > 0) {
      console.log('\n   Sample products in feed:');
      feedProducts.slice(0, 3).forEach(p => {
        console.log(`   - ${p.name} (${p.brands.name})`);
      });
    }
    
    console.log('\n🎉 Test user setup complete!');
    console.log('\nTest user credentials:');
    console.log('  Username: klshumway');
    console.log('  (Use the password you set in Supabase Dashboard)');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

setupTestUser();
