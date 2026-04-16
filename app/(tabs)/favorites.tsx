import { BrandRowCard } from '@/components/BrandRowCard';
import { HorizontalProductCard } from '@/components/HorizontalProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
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

const PAGE_SIZE = 40;

export default function FavoritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<BrandWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const productsListRef = useRef<FlatList>(null);
  const brandsListRef = useRef<FlatList>(null);
  const productsScrollRef = useRef(0);
  const brandsScrollRef = useRef(0);
  const productsLoadedRef = useRef(false);
  const brandsLoadedRef = useRef(false);

  // Only fetch on first focus or when user changes — not on every tab switch back
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setProducts([]);
        setBrands([]);
        setLoading(false);
        return;
      }

      if (activeTab === 'products') {
        if (!productsLoadedRef.current) {
          fetchProducts(true);
        } else if (productsScrollRef.current > 0) {
          setTimeout(() => {
            productsListRef.current?.scrollToOffset({ offset: productsScrollRef.current, animated: false });
          }, 50);
        }
      } else {
        if (!brandsLoadedRef.current) {
          fetchBrands();
        } else if (brandsScrollRef.current > 0) {
          setTimeout(() => {
            brandsListRef.current?.scrollToOffset({ offset: brandsScrollRef.current, animated: false });
          }, 50);
        }
      }
    }, [user, activeTab])
  );

  // Fetch liked products with pagination
  const fetchProducts = async (reset: boolean) => {
    if (!user) return;
    try {
      if (reset) setLoading(true);
      const offset = reset ? 0 : products.length;

      const { data, error } = await supabase.rpc('get_user_liked_products', {
        p_user_id: user.id,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });

      if (error) throw error;

      const mapped = (data || []).map((p: any) => ({
        ...p,
        brand: { id: p.brand_id, name: p.brand_name, slug: p.brand_slug, logo_url: p.brand_logo_url },
        is_liked: true,
      }));

      if (reset) {
        setProducts(mapped);
      } else {
        setProducts(prev => [...prev, ...mapped]);
      }
      setHasMoreProducts(mapped.length >= PAGE_SIZE);
      productsLoadedRef.current = true;
    } catch (err) {
      console.error('Error fetching liked products:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Fetch followed brands with products — batched (3 queries total instead of 2*N)
  const fetchBrands = async () => {
    if (!user) return;
    try {
      setLoading(true);

      // 1. Get followed brands (one query)
      const { data: followedData, error: followError } = await supabase
        .from('user_follows_brands')
        .select('brand_id, brands(*)')
        .eq('user_id', user.id)
        .order('followed_at', { ascending: false });

      if (followError) throw followError;
      if (!followedData || followedData.length === 0) {
        setBrands([]);
        brandsLoadedRef.current = true;
        setLoading(false);
        return;
      }

      const brandIds = followedData.map(f => f.brand_id);

      // 2. Batch fetch latest 10 products per brand (one query)
      const { data: allProducts, error: prodError } = await supabase
        .from('products')
        .select(`
          id, name, price, sale_price, currency, image_url, additional_images, product_url, like_count, created_at, brand_id,
          brand:brands(id, name, slug, logo_url)
        `)
        .in('brand_id', brandIds)
        .eq('is_available', true)
        .order('created_at', { ascending: false });

      if (prodError) throw prodError;

      // 3. Batch check likes for all products (one query)
      const productIds = (allProducts || []).map(p => p.id);
      let likedIds = new Set<string>();
      if (productIds.length > 0) {
        const { data: likedData } = await supabase
          .from('user_likes_products')
          .select('product_id')
          .eq('user_id', user.id)
          .in('product_id', productIds);
        likedIds = new Set(likedData?.map(l => l.product_id) || []);
      }

      // Group products by brand (max 10 per brand), add like status
      const productsByBrand = new Map<string, any[]>();
      for (const p of allProducts || []) {
        const bid = p.brand_id;
        if (!productsByBrand.has(bid)) productsByBrand.set(bid, []);
        const list = productsByBrand.get(bid)!;
        if (list.length < 10) {
          list.push({ ...p, is_liked: likedIds.has(p.id) });
        }
      }

      // Build brands list preserving follow order
      const result: BrandWithProducts[] = [];
      for (const item of followedData) {
        const brand = item.brands as any;
        if (!brand) continue;
        const prods = productsByBrand.get(brand.id) || [];
        if (prods.length > 0) {
          result.push({ ...brand, products: prods });
        }
      }

      setBrands(result);
      brandsLoadedRef.current = true;
    } catch (err) {
      console.error('Error fetching followed brands:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreProducts = async () => {
    if (loadingMore || !hasMoreProducts) return;
    setLoadingMore(true);
    await fetchProducts(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'products') {
      await fetchProducts(true);
    } else {
      await fetchBrands();
    }
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

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Text style={styles.appName}>cherry</Text>
        </View>
        <View style={styles.guestContainer}>
          <Ionicons name="heart-outline" size={64} color="#ccc" />
          <Text style={styles.guestTitle}>Your Favorites</Text>
          <Text style={styles.guestSubtext}>
            Sign in to save your favorite products and brands
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.7}>
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
      onEndReached={loadMoreProducts}
      onEndReachedThreshold={0.5}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews={true}
      initialNumToRender={10}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footerLoader}>
            <ActivityIndicator size="small" color="#000" />
          </View>
        ) : null
      }
      ListEmptyComponent={
        !loading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No liked products yet</Text>
            <Text style={styles.emptySubtext}>
              Products you heart will appear here
            </Text>
          </View>
        ) : null
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
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  guestContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  guestTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
  },
  guestSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  signInButton: {
    paddingHorizontal: 48,
    paddingVertical: 14,
    backgroundColor: '#000',
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 1,
  },
});
