import { AddToCollectionSheet } from '@/components/AddToCollectionSheet';
import { ProductCard } from '@/components/ProductCard';
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

const PRODUCTS_PER_PAGE = 20;
const FETCH_BATCH_SIZE = 100; // Fetch more to enable better interleaving

// Score and rank products based on user preferences, then interleave by brand
const scoreAndInterleaveProducts = (
  products: any[],
  brandAffinityScores: Map<string, number>
): any[] => {
  if (products.length === 0) return [];
  
  // Calculate score for each product
  const now = Date.now();
  const scoredProducts = products.map(product => {
    const brandId = product.brand?.id || 'unknown';
    
    // Brand affinity score (0-50 points based on how many products user liked from this brand)
    const brandAffinity = brandAffinityScores.get(brandId) || 0;
    const affinityScore = Math.min(brandAffinity * 5, 50); // Cap at 50 points
    
    // Recency score (0-30 points, newer = higher)
    const productAge = now - new Date(product.created_at).getTime();
    const hoursOld = productAge / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 30 - hoursOld); // Lose ~1 point per hour
    
    // Small random factor for variety (0-20 points)
    const randomScore = Math.random() * 20;
    
    const totalScore = affinityScore + recencyScore + randomScore;
    
    return { ...product, _score: totalScore };
  });
  
  // Group products by brand
  const brandGroups: Map<string, any[]> = new Map();
  for (const product of scoredProducts) {
    const brandId = product.brand?.id || 'unknown';
    if (!brandGroups.has(brandId)) {
      brandGroups.set(brandId, []);
    }
    brandGroups.get(brandId)!.push(product);
  }
  
  // Sort products within each brand by score (highest first)
  for (const [_, brandProducts] of brandGroups) {
    brandProducts.sort((a, b) => b._score - a._score);
  }
  
  // Sort brands by their top product's score (preferred brands appear first in rotation)
  const brandArrays = Array.from(brandGroups.entries())
    .sort((a, b) => {
      const aTopScore = a[1][0]?._score || 0;
      const bTopScore = b[1][0]?._score || 0;
      return bTopScore - aTopScore;
    })
    .map(([_, products]) => products);
  
  // Round-robin interleave: take one product from each brand in turn
  // This ensures variety while respecting preference order within brands
  const interleaved: any[] = [];
  let hasMore = true;
  let index = 0;
  
  while (hasMore) {
    hasMore = false;
    for (const brandProducts of brandArrays) {
      if (index < brandProducts.length) {
        // Remove the internal _score before adding to final list
        const { _score, ...product } = brandProducts[index];
        interleaved.push(product);
        hasMore = true;
      }
    }
    index++;
  }
  
  return interleaved;
};

export default function NewTodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollPositionRef = useRef(0);
  const shouldRestoreScroll = useRef(false);
  const [collectionSheetVisible, setCollectionSheetVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      shouldRestoreScroll.current = scrollPositionRef.current > 0;
      fetchProducts();
    }, [user])
  );

  const fetchProducts = async (reset = true) => {
    if (!user) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      }

      const currentOffset = reset ? 0 : offset;

      // Get the timestamp for 24 hours ago
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      // First, get followed brand IDs
      const { data: followedBrands, error: followError } = await supabase
        .from('user_follows_brands')
        .select('brand_id')
        .eq('user_id', user.id);

      if (followError) throw followError;

      const followedBrandIds = followedBrands?.map(f => f.brand_id) || [];

      if (followedBrandIds.length === 0) {
        setProducts([]);
        setLoading(false);
        setHasMore(false);
        return;
      }

      // Fetch user's brand affinity (how many products they've liked from each brand)
      const { data: likedProductsBrands } = await supabase
        .from('user_likes_products')
        .select('products(brand_id)')
        .eq('user_id', user.id);

      // Build brand affinity map (brand_id -> count of liked products)
      const brandAffinityScores = new Map<string, number>();
      for (const item of likedProductsBrands || []) {
        const brandId = (item.products as any)?.brand_id;
        if (brandId) {
          brandAffinityScores.set(brandId, (brandAffinityScores.get(brandId) || 0) + 1);
        }
      }

      // Fetch products from followed brands added in the last 24 hours
      // Fetch a larger batch to enable better interleaving across brands
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          id, name, price, sale_price, currency, image_url, additional_images, product_url, like_count, created_at,
          brand:brands(id, name, slug, logo_url)
        `)
        .in('brand_id', followedBrandIds)
        .eq('is_available', true)
        .gte('created_at', twentyFourHoursAgo.toISOString())
        .order('created_at', { ascending: false })
        .range(currentOffset, currentOffset + FETCH_BATCH_SIZE - 1);

      if (productsError) throw productsError;

      // Check which products the user has liked
      let productsWithLikes = productsData || [];
      if (productsWithLikes.length > 0) {
        const productIds = productsWithLikes.map(p => p.id);
        const { data: likedData } = await supabase
          .from('user_likes_products')
          .select('product_id')
          .eq('user_id', user.id)
          .in('product_id', productIds);

        const likedIds = new Set(likedData?.map(l => l.product_id) || []);
        productsWithLikes = productsWithLikes.map(p => ({
          ...p,
          is_liked: likedIds.has(p.id),
        }));
      }

      // Score and interleave products by brand for variety + preference ranking
      const interleavedProducts = scoreAndInterleaveProducts(productsWithLikes, brandAffinityScores);

      if (reset) {
        setProducts(interleavedProducts as any);
        setOffset(FETCH_BATCH_SIZE);
      } else {
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newProducts = interleavedProducts.filter((p: any) => !existingIds.has(p.id));
          return [...prev, ...newProducts] as any;
        });
        setOffset(prev => prev + FETCH_BATCH_SIZE);
      }

      setHasMore(productsWithLikes.length === FETCH_BATCH_SIZE);
    } catch (err) {
      console.error('Error fetching new today products:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      if (shouldRestoreScroll.current) {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: scrollPositionRef.current,
            animated: false,
          });
          shouldRestoreScroll.current = false;
        }, 300);
      }
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchProducts(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProducts();
    setRefreshing(false);
  };

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const handleBrandPress = (brandSlug: string) => {
    router.push(`/brand/${brandSlug}`);
  };

  const handleToggleLike = async (productId: string) => {
    if (!user) return;

    const product = products.find(p => p.id === productId);
    if (!product) return;

    const wasLiked = product.is_liked;

    // Optimistic update
    setProducts(prev =>
      prev.map(p =>
        p.id === productId
          ? {
              ...p,
              is_liked: !wasLiked,
              like_count: wasLiked ? Math.max(0, p.like_count - 1) : p.like_count + 1,
            }
          : p
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
      setProducts(prev =>
        prev.map(p =>
          p.id === productId
            ? {
                ...p,
                is_liked: wasLiked,
                like_count: wasLiked ? p.like_count + 1 : Math.max(0, p.like_count - 1),
              }
            : p
        )
      );
    }
  };

  const handleLongPressItem = useCallback((product: { id: string; name: string }) => {
    setSelectedProduct(product);
    setCollectionSheetVisible(true);
  }, []);

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  const renderProductItem = ({ item }: { item: Product }) => (
    <View style={styles.cardWrapper}>
      <ProductCard
        product={item}
        onPress={() => handleProductPress(item.id)}
        onLike={() => handleToggleLike(item.id)}
        onBrandPress={() => handleBrandPress(item.brand?.slug || '')}
        onLongPress={() => handleLongPressItem({ id: item.id, name: item.name })}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.replace('/')} activeOpacity={0.7}>
          <Text style={styles.appName}>cherry</Text>
        </TouchableOpacity>
      </View>

      {/* Products Grid */}
      <FlatList
        ref={flatListRef}
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          scrollPositionRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
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
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No new products today</Text>
            <Text style={styles.emptySubtext}>
              Products from brands you follow added in the last 24 hours will appear here
            </Text>
          </View>
        }
        renderItem={renderProductItem}
      />

      {/* Add to Collection Sheet */}
      {selectedProduct && (
        <AddToCollectionSheet
          visible={collectionSheetVisible}
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          onClose={() => setCollectionSheetVisible(false)}
          onAdded={() => {}}
        />
      )}
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
  listContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  cardWrapper: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  emptyContainer: {
    paddingVertical: 48,
    paddingHorizontal: 32,
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
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
