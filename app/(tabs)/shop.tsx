import { AddToCollectionSheet } from '@/components/AddToCollectionSheet';
import { ProductCard } from '@/components/ProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { useTabRefresh } from '@/contexts/HomeRefreshContext';
import { Product } from '@/hooks/useProducts';
import { supabase } from '@/utils/supabase';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActionSheetIOS,
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FETCH_BATCH_SIZE = 100; // Fetch more to enable better interleaving
const MAX_DAYS_BACK = 14; // How far back to go

// Types for feed items (products + section headers)
type FeedItem = 
  | { type: 'product'; data: Product }
  | { type: 'section'; dayOffset: number; label: string };

// Get label for day offset
const getDayLabel = (dayOffset: number): string => {
  if (dayOffset === 0) return 'New Today';
  if (dayOffset === 1) return 'Yesterday';
  return `${dayOffset} Days Ago`;
};

// Get date range for a specific day offset (0 = today, 1 = yesterday, etc.)
const getDayRange = (dayOffset: number): { start: Date; end: Date } => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - dayOffset + 1); // Start of "tomorrow" for today's range
  
  const start = new Date(end);
  start.setDate(start.getDate() - 1); // Start of the day
  
  return { start, end };
};

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
  const { registerRefresh } = useTabRefresh();

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentDayOffset, setCurrentDayOffset] = useState(0);
  const [dayOffset_internal, setDayOffsetInternal] = useState(0); // Track which day we're fetching
  const [followedBrandIds, setFollowedBrandIds] = useState<string[]>([]);
  const [brandAffinityScores, setBrandAffinityScores] = useState<Map<string, number>>(new Map());
  const flatListRef = useRef<FlatList>(null);
  const scrollPositionRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const [collectionSheetVisible, setCollectionSheetVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);

  // Scroll to top and refresh when tab is tapped while already on this screen
  const scrollToTopAndRefresh = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    scrollPositionRef.current = 0;
    hasLoadedRef.current = false;
    initializeFeed();
  }, []);

  // Register the refresh callback with the tab layout
  useEffect(() => {
    registerRefresh('shop', scrollToTopAndRefresh);
  }, [registerRefresh, scrollToTopAndRefresh]);

  // Fetch on initial load only
  useFocusEffect(
    useCallback(() => {
      // Only fetch if we haven't loaded data yet
      // This prevents reload when returning from product detail
      if (!hasLoadedRef.current) {
        initializeFeed();
      } else {
        // Restore scroll position when returning to this screen
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: scrollPositionRef.current,
            animated: false,
          });
        }, 50);
      }
    }, [])
  );

  // Refetch if user changes (login/logout)
  useEffect(() => {
    if (user && !hasLoadedRef.current) {
      initializeFeed();
    } else if (!user) {
      setFeedItems([]);
      setFollowedBrandIds([]);
      hasLoadedRef.current = false;
    }
  }, [user]);

  // Initialize the feed - fetch user data and first day's products
  const initializeFeed = async () => {
    if (!user) {
      setFeedItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setCurrentDayOffset(0);
      setDayOffsetInternal(0);

      // First, get followed brand IDs
      const { data: followedBrands, error: followError } = await supabase
        .from('user_follows_brands')
        .select('brand_id')
        .eq('user_id', user.id);

      if (followError) throw followError;

      const brandIds = followedBrands?.map(f => f.brand_id) || [];
      setFollowedBrandIds(brandIds);

      if (brandIds.length === 0) {
        setFeedItems([]);
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
      const affinityScores = new Map<string, number>();
      for (const item of likedProductsBrands || []) {
        const brandId = (item.products as any)?.brand_id;
        if (brandId) {
          affinityScores.set(brandId, (affinityScores.get(brandId) || 0) + 1);
        }
      }
      setBrandAffinityScores(affinityScores);

      // Fetch first day's products
      const dayProducts = await fetchProductsForDay(0, brandIds, affinityScores);
      
      // Start with "New Today" section header + products
      const items: FeedItem[] = [
        { type: 'section', dayOffset: 0, label: getDayLabel(0) },
        ...dayProducts.map(p => ({ type: 'product' as const, data: p })),
      ];
      
      setFeedItems(items);
      setHasMore(true);
      hasLoadedRef.current = true;
    } catch (err) {
      console.error('Error initializing feed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch products for a specific day
  const fetchProductsForDay = async (
    dayOffset: number,
    brandIds: string[],
    affinityScores: Map<string, number>
  ): Promise<Product[]> => {
    const { start, end } = getDayRange(dayOffset);
    
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select(`
        id, name, price, sale_price, currency, image_url, additional_images, product_url, like_count, created_at,
        brand:brands(id, name, slug, logo_url)
      `)
      .in('brand_id', brandIds)
      .eq('is_available', true)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: false });

    if (productsError) throw productsError;

    // Check which products the user has liked
    let productsWithLikes = productsData || [];
    if (productsWithLikes.length > 0 && user) {
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
    return scoreAndInterleaveProducts(productsWithLikes, affinityScores) as Product[];
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || followedBrandIds.length === 0) return;
    setLoadingMore(true);
    
    try {
      // Move to next day
      const nextDayOffset = currentDayOffset + 1;
      
      if (nextDayOffset >= MAX_DAYS_BACK) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      const dayProducts = await fetchProductsForDay(nextDayOffset, followedBrandIds, brandAffinityScores);
      
      // Add section header + products for this day
      const newItems: FeedItem[] = [
        { type: 'section', dayOffset: nextDayOffset, label: getDayLabel(nextDayOffset) },
        ...dayProducts.map(p => ({ type: 'product' as const, data: p })),
      ];
      
      setFeedItems(prev => [...prev, ...newItems]);
      setCurrentDayOffset(nextDayOffset);
      setHasMore(nextDayOffset < MAX_DAYS_BACK - 1);
    } catch (err) {
      console.error('Error loading more products:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    hasLoadedRef.current = false;
    await initializeFeed();
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

    const productItem = feedItems.find(item => item.type === 'product' && item.data.id === productId);
    if (!productItem || productItem.type !== 'product') return;
    
    const product = productItem.data;
    const wasLiked = product.is_liked;

    // Optimistic update
    setFeedItems(prev =>
      prev.map(item =>
        item.type === 'product' && item.data.id === productId
          ? {
              ...item,
              data: {
                ...item.data,
                is_liked: !wasLiked,
                like_count: wasLiked ? Math.max(0, item.data.like_count - 1) : item.data.like_count + 1,
              },
            }
          : item
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
      setFeedItems(prev =>
        prev.map(item =>
          item.type === 'product' && item.data.id === productId
            ? {
                ...item,
                data: {
                  ...item.data,
                  is_liked: wasLiked,
                  like_count: wasLiked ? item.data.like_count + 1 : Math.max(0, item.data.like_count - 1),
                },
              }
            : item
        )
      );
    }
  };

  const markNotInterested = async (productId: string) => {
    if (!user) return;
    
    // Optimistically remove from feed
    setFeedItems(prev => prev.filter(item => 
      item.type !== 'product' || item.data.id !== productId
    ));
    
    try {
      await supabase.rpc('mark_not_interested', {
        p_user_id: user.id,
        p_product_id: productId,
      });
      console.log('[not-interested] Marked product as not interested:', productId);
    } catch (err) {
      console.error('Error marking not interested:', err);
    }
  };

  const handleLongPressItem = useCallback((product: { id: string; name: string }) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Not Interested', 'Add to Collection'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
        },
        (buttonIndex: number) => {
          if (buttonIndex === 1) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            markNotInterested(product.id);
          } else if (buttonIndex === 2) {
            setSelectedProduct(product);
            setCollectionSheetVisible(true);
          }
        }
      );
    } else {
      Alert.alert(
        product.name,
        'Choose an action',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Not Interested',
            style: 'destructive',
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              markNotInterested(product.id);
            },
          },
          {
            text: 'Add to Collection',
            onPress: () => {
              setSelectedProduct(product);
              setCollectionSheetVisible(true);
            },
          },
        ]
      );
    }
  }, [user]);

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  // Get only product items for display calculations
  const products = feedItems.filter((item): item is { type: 'product'; data: Product } => item.type === 'product');

  // Render section header
  const renderSectionHeader = (label: string) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLine} />
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionLine} />
    </View>
  );

  // Render a single product card
  const renderProductCard = (product: Product) => (
    <View style={styles.cardWrapper} key={product.id}>
      <ProductCard
        product={product}
        onPress={() => handleProductPress(product.id)}
        onLike={() => handleToggleLike(product.id)}
        onBrandPress={() => handleBrandPress(product.brand?.slug || '')}
        onLongPress={() => handleLongPressItem({ id: product.id, name: product.name })}
      />
    </View>
  );

  // Render feed item (section or product row)
  const renderFeedItem = ({ item, index }: { item: FeedItem; index: number }) => {
    if (item.type === 'section') {
      return renderSectionHeader(item.label);
    }
    
    // For products, we need to render in pairs (2 columns)
    // Only render on even indices to avoid duplicates
    const productItems = feedItems.filter(i => i.type === 'product') as { type: 'product'; data: Product }[];
    const productIndex = productItems.findIndex(p => p.data.id === item.data.id);
    
    // Skip odd product indices (they're rendered with the previous item)
    if (productIndex % 2 !== 0) return null;
    
    const currentProduct = item.data;
    const nextProductItem = productItems[productIndex + 1];
    const nextProduct = nextProductItem?.data;
    
    return (
      <View style={styles.rowWrapper}>
        {renderProductCard(currentProduct)}
        {nextProduct ? renderProductCard(nextProduct) : <View style={styles.cardWrapper} />}
      </View>
    );
  };

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
        data={feedItems}
        keyExtractor={(item, index) => 
          item.type === 'section' ? `section-${item.dayOffset}` : `product-${item.data.id}`
        }
        contentContainerStyle={styles.listContent}
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
              Products from brands you follow will appear here
            </Text>
          </View>
        }
        renderItem={renderFeedItem}
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
  rowWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardWrapper: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  sectionLabel: {
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
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
