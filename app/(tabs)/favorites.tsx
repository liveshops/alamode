import { BrandRowCard } from '@/components/BrandRowCard';
import { HorizontalProductCard } from '@/components/HorizontalProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { supabase } from '@/utils/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  follower_count: number;
}

interface BrandWithProducts extends Brand {
  products: Product[];
}

type TabType = 'products' | 'brands';

export default function FavoritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<BrandWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const productsListRef = useRef<FlatList>(null);
  const brandsListRef = useRef<FlatList>(null);
  const productsScrollRef = useRef(0);
  const brandsScrollRef = useRef(0);
  const shouldRestoreProductsScroll = useRef(false);
  const shouldRestoreBrandsScroll = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'products') {
        shouldRestoreProductsScroll.current = productsScrollRef.current > 0;
      } else {
        shouldRestoreBrandsScroll.current = brandsScrollRef.current > 0;
      }
      fetchData();
    }, [user, activeTab])
  );

  const fetchData = async () => {
    if (!user) {
      setProducts([]);
      setBrands([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Use optimized database function for liked products
      const { data: likedProductsData, error: productsError } = await supabase
        .rpc('get_user_liked_products', {
          p_user_id: user.id,
          p_limit: 100,
          p_offset: 0
        });

      if (productsError) throw productsError;

      const productsWithLiked = (likedProductsData || []).map((product: any) => ({
        ...product,
        brand: {
          id: product.brand_id,
          name: product.brand_name,
          slug: product.brand_slug,
          logo_url: product.brand_logo_url,
        },
        is_liked: true,
      }));

      setProducts(productsWithLiked);

      // Fetch followed brands with their products
      const { data: followedBrandsData, error: brandsError } = await supabase
        .from('user_follows_brands')
        .select(
          `
          brand_id,
          brands (*)
        `
        )
        .eq('user_id', user.id)
        .order('followed_at', { ascending: false });

      if (brandsError) throw brandsError;

      // Fetch products for each followed brand
      const brandsWithProducts: BrandWithProducts[] = [];
      for (const item of followedBrandsData || []) {
        const brand = item.brands;
        if (!brand) continue;

        const { data: productsData } = await supabase
          .from('products')
          .select(`
            id, name, price, sale_price, currency, image_url, additional_images, product_url, like_count, created_at,
            brand:brands(id, name, slug, logo_url)
          `)
          .eq('brand_id', brand.id)
          .eq('is_available', true)
          .order('created_at', { ascending: false })
          .limit(10);

        let products = productsData || [];
        if (products.length > 0) {
          const { data: likedData } = await supabase
            .from('user_likes_products')
            .select('product_id')
            .eq('user_id', user.id)
            .in('product_id', products.map(p => p.id));

          const likedIds = new Set(likedData?.map(l => l.product_id) || []);
          products = products.map(p => ({ ...p, is_liked: likedIds.has(p.id) }));
        }

        // Only include brands that have products
        if (products.length > 0) {
          brandsWithProducts.push({
            ...brand,
            products,
          });
        }
      }

      setBrands(brandsWithProducts);
    } catch (err) {
      console.error('Error fetching favorites:', err);
    } finally {
      setLoading(false);
      // Restore scroll after data loads
      setTimeout(() => {
        if (shouldRestoreProductsScroll.current) {
          productsListRef.current?.scrollToOffset({
            offset: productsScrollRef.current,
            animated: false,
          });
          shouldRestoreProductsScroll.current = false;
        }
        if (shouldRestoreBrandsScroll.current) {
          brandsListRef.current?.scrollToOffset({
            offset: brandsScrollRef.current,
            animated: false,
          });
          shouldRestoreBrandsScroll.current = false;
        }
      }, 300);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleToggleLike = async (productId: string) => {
    if (!user) return;

    const product = products.find((p) => p.id === productId);
    if (!product) return;

    // Optimistically remove from list
    setProducts((prev) => prev.filter((p) => p.id !== productId));

    try {
      await supabase
        .from('user_likes_products')
        .delete()
        .eq('user_id', user.id)
        .eq('product_id', productId);
    } catch (err) {
      console.error('Error unliking product:', err);
      // Revert on error
      setProducts((prev) => [product, ...prev]);
    }
  };

  const handleToggleFollowBrand = async (brandId: string) => {
    if (!user) return;

    const brand = brands.find((b) => b.id === brandId);
    if (!brand) return;

    // Optimistically remove from list
    setBrands((prev) => prev.filter((b) => b.id !== brandId));

    try {
      await supabase
        .from('user_follows_brands')
        .delete()
        .eq('user_id', user.id)
        .eq('brand_id', brandId);
    } catch (err) {
      console.error('Error unfollowing brand:', err);
      // Revert on error
      setBrands((prev) => [brand, ...prev]);
    }
  };

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const handleBrandPress = (brandSlug: string) => {
    router.push(`/brand/${brandSlug}`);
  };

  // Handle toggling like for products in the brands list
  const handleToggleLikeInBrand = async (productId: string) => {
    if (!user) return;

    // Find the product in brands
    let product: Product | undefined;
    let brandId: string | undefined;
    
    for (const brand of brands) {
      const foundProduct = brand.products.find((p) => p.id === productId);
      if (foundProduct) {
        product = foundProduct as Product;
        brandId = brand.id;
        break;
      }
    }

    if (!product || !brandId) return;

    const wasLiked = product.is_liked;

    // Optimistic update
    setBrands((prev) =>
      prev.map((b) =>
        b.id === brandId
          ? {
              ...b,
              products: b.products.map((p) =>
                p.id === productId
                  ? {
                      ...p,
                      is_liked: !wasLiked,
                      like_count: wasLiked ? Math.max(0, p.like_count - 1) : p.like_count + 1,
                    }
                  : p
              ),
            }
          : b
      )
    );

    try {
      if (wasLiked) {
        await supabase
          .from('user_likes_products')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);
      } else {
        await supabase
          .from('user_likes_products')
          .upsert(
            { user_id: user.id, product_id: productId },
            { onConflict: 'user_id,product_id', ignoreDuplicates: true }
          );
      }
    } catch (err) {
      console.error('Error toggling like:', err);
      // Revert on error
      setBrands((prev) =>
        prev.map((b) =>
          b.id === brandId
            ? {
                ...b,
                products: b.products.map((p) =>
                  p.id === productId
                    ? {
                        ...p,
                        is_liked: wasLiked,
                        like_count: wasLiked ? p.like_count + 1 : Math.max(0, p.like_count - 1),
                      }
                    : p
                ),
              }
            : b
        )
      );
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  const renderProductsList = () => (
    <FlatList
      ref={productsListRef}
      data={products}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => {
        productsScrollRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No liked products yet</Text>
          <Text style={styles.emptySubtext}>
            Products you heart will appear here
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <HorizontalProductCard
          product={item}
          onPress={() => handleProductPress(item.id)}
          onLike={() => handleToggleLike(item.id)}
          onBrandPress={() => handleBrandPress(item.brand.slug)}
        />
      )}
    />
  );

  const renderBrandsList = () => (
    <FlatList
      ref={brandsListRef}
      data={brands}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.brandsListContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => {
        brandsScrollRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No followed brands yet</Text>
          <Text style={styles.emptySubtext}>
            Brands you follow will appear here
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <BrandRowCard
          brandName={item.name}
          brandSlug={item.slug}
          isFollowing={true}
          followerCount={item.follower_count}
          products={item.products as any}
          onBrandPress={() => handleBrandPress(item.slug)}
          onToggleFollow={() => handleToggleFollowBrand(item.id)}
          onProductPress={handleProductPress}
          onToggleLike={handleToggleLikeInBrand}
        />
      )}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.replace('/')} activeOpacity={0.7}>
          <Text style={styles.appName}>cherry</Text>
        </TouchableOpacity>
      </View>

      {/* Segmented Control */}
      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[styles.segment, activeTab === 'products' && styles.segmentActive]}
          onPress={() => setActiveTab('products')}
          activeOpacity={0.7}>
          <Text style={[styles.segmentText, activeTab === 'products' && styles.segmentTextActive]}>
            Products
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, activeTab === 'brands' && styles.segmentActive]}
          onPress={() => setActiveTab('brands')}
          activeOpacity={0.7}>
          <Text style={[styles.segmentText, activeTab === 'brands' && styles.segmentTextActive]}>
            Brands
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'products' ? renderProductsList() : renderBrandsList()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  appName: {
    fontFamily: 'AbrilFatface-Regular',
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: 2,
  },
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 0,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#fff',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  segmentTextActive: {
    color: '#000',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  brandsListContent: {
    paddingTop: 8,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
  },
});
