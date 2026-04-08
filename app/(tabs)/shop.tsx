import { AddToCollectionSheet } from '@/components/AddToCollectionSheet';
import { ProductCard } from '@/components/ProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { useTabRefresh } from '@/contexts/HomeRefreshContext';
import { Product } from '@/hooks/useProducts';
import { supabase } from '@/utils/supabase';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const PAGE_SIZE = 40; // Products per page within a day
const MAX_DAYS_BACK = 14; // How far back to go

// Feed item types
type FeedItem = 
  | { type: 'product'; data: Product }
  | { type: 'section'; dayOffset: number; label: string };

// Row-level items (pre-computed for O(1) rendering)
type RowItem = 
  | { type: 'section'; dayOffset: number; label: string }
  | { type: 'productRow'; products: [Product, Product?] };

// Get label for day offset
const getDayLabel = (dayOffset: number): string => {
  if (dayOffset === 0) return 'New Today';
  if (dayOffset === 1) return 'Yesterday';
  return `${dayOffset} Days Ago`;
};

// Score and rank products based on user preferences, then interleave by brand
// brand_affinity comes pre-computed from the DB function on each product row
const scoreAndInterleaveProducts = (products: any[]): any[] => {
  if (products.length === 0) return [];
  
  const now = Date.now();
  const scoredProducts = products.map(product => {
    const brandId = product.brand_id || 'unknown';
    const affinityScore = Math.min((product.brand_affinity || 0) * 5, 50);
    const productAge = now - new Date(product.created_at).getTime();
    const hoursOld = productAge / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 30 - hoursOld);
    const randomScore = Math.random() * 20;
    return { ...product, _score: affinityScore + recencyScore + randomScore };
  });
  
  // Group by brand and round-robin interleave
  const brandGroups: Map<string, any[]> = new Map();
  for (const product of scoredProducts) {
    const brandId = product.brand_id || 'unknown';
    if (!brandGroups.has(brandId)) brandGroups.set(brandId, []);
    brandGroups.get(brandId)!.push(product);
  }
  
  for (const [_, bp] of brandGroups) bp.sort((a, b) => b._score - a._score);
  
  const brandArrays = Array.from(brandGroups.entries())
    .sort((a, b) => (b[1][0]?._score || 0) - (a[1][0]?._score || 0))
    .map(([_, p]) => p);
  
  const interleaved: any[] = [];
  let more = true;
  let idx = 0;
  while (more) {
    more = false;
    for (const bp of brandArrays) {
      if (idx < bp.length) {
        const { _score, ...product } = bp[idx];
        interleaved.push(product);
        more = true;
      }
    }
    idx++;
  }
  return interleaved;
};

// Map RPC result rows to Product shape expected by ProductCard
const mapRpcToProduct = (row: any): Product => ({
  ...row,
  brand: {
    id: row.brand_id,
    name: row.brand_name,
    slug: row.brand_slug,
    logo_url: row.brand_logo_url,
  },
} as unknown as Product);

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
  const [dayPageOffset, setDayPageOffset] = useState(0);
  const [dayHasMore, setDayHasMore] = useState(false);
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
      hasLoadedRef.current = false;
    }
  }, [user]);

  // Fetch a page of products for a given day using the single DB function
  const fetchPage = async (
    dayOffset: number,
    limit: number,
    offset: number
  ): Promise<Product[]> => {
    if (!user) return [];

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

    const { data, error } = await supabase.rpc('get_new_today_feed', {
      p_user_id: user.id,
      p_day_offset: dayOffset,
      p_limit: limit,
      p_offset: offset,
      p_timezone: userTimezone,
    });

    if (error) throw error;

    // Score, interleave by brand, then map to Product shape
    const interleaved = scoreAndInterleaveProducts(data || []);
    return interleaved.map(mapRpcToProduct);
  };

  // Initialize the feed
  const initializeFeed = async () => {
    if (!user) {
      setFeedItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setCurrentDayOffset(0);
      setDayPageOffset(0);
      setDayHasMore(false);

      // Single RPC call: gets followed brands, affinity, products, likes — all in one
      const dayProducts = await fetchPage(0, PAGE_SIZE, 0);

      if (dayProducts.length === 0) {
        // Could be no followed brands or no products today
        setFeedItems([]);
        setHasMore(true); // Still try older days
      } else {
        const items: FeedItem[] = [
          { type: 'section', dayOffset: 0, label: getDayLabel(0) },
          ...dayProducts.map(p => ({ type: 'product' as const, data: p })),
        ];
        setFeedItems(items);
      }

      setDayPageOffset(dayProducts.length);
      setDayHasMore(dayProducts.length >= PAGE_SIZE);
      setHasMore(true);
      hasLoadedRef.current = true;
    } catch (err) {
      console.error('Error initializing feed:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    
    try {
      if (dayHasMore) {
        // Load more from current day
        const moreProducts = await fetchPage(currentDayOffset, PAGE_SIZE, dayPageOffset);
        
        if (moreProducts.length > 0) {
          const newItems: FeedItem[] = moreProducts.map(p => ({ type: 'product' as const, data: p }));
          setFeedItems(prev => [...prev, ...newItems]);
          setDayPageOffset(prev => prev + moreProducts.length);
          setDayHasMore(moreProducts.length >= PAGE_SIZE);
        } else {
          setDayHasMore(false);
        }
      }
      
      if (!dayHasMore) {
        // Move to next day
        const nextDayOffset = currentDayOffset + 1;
        
        if (nextDayOffset >= MAX_DAYS_BACK) {
          setHasMore(false);
          setLoadingMore(false);
          return;
        }

        const dayProducts = await fetchPage(nextDayOffset, PAGE_SIZE, 0);
        
        const newItems: FeedItem[] = [
          { type: 'section', dayOffset: nextDayOffset, label: getDayLabel(nextDayOffset) },
          ...dayProducts.map(p => ({ type: 'product' as const, data: p })),
        ];
        
        setFeedItems(prev => [...prev, ...newItems]);
        setCurrentDayOffset(nextDayOffset);
        setDayPageOffset(dayProducts.length);
        setDayHasMore(dayProducts.length >= PAGE_SIZE);
        setHasMore(nextDayOffset < MAX_DAYS_BACK - 1 || dayProducts.length >= PAGE_SIZE);
      }
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

  const handleProductPress = useCallback((productId: string) => {
    router.push(`/product/${productId}`);
  }, [router]);

  const handleBrandPress = useCallback((brandSlug: string) => {
    router.push(`/brand/${brandSlug}`);
  }, [router]);

  const handleToggleLike = useCallback(async (productId: string) => {
    if (!user) return;

    // Determine current like state from feedItems via functional setState
    let wasLiked = false;
    setFeedItems(prev => {
      const productItem = prev.find(item => item.type === 'product' && item.data.id === productId);
      if (productItem && productItem.type === 'product') {
        wasLiked = !!productItem.data.is_liked;
      }
      return prev.map(item =>
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
      );
    });

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
  }, [user]);

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

  // Pre-compute row items from feedItems: group products into pairs, keep sections as-is
  // This makes renderItem O(1) instead of O(n²)
  const rowItems: RowItem[] = React.useMemo(() => {
    const rows: RowItem[] = [];
    let pendingProduct: Product | null = null;

    for (const item of feedItems) {
      if (item.type === 'section') {
        // Flush any pending single product before a new section
        if (pendingProduct) {
          rows.push({ type: 'productRow', products: [pendingProduct] });
          pendingProduct = null;
        }
        rows.push(item);
      } else {
        if (pendingProduct) {
          rows.push({ type: 'productRow', products: [pendingProduct, item.data] });
          pendingProduct = null;
        } else {
          pendingProduct = item.data;
        }
      }
    }
    // Flush last pending product
    if (pendingProduct) {
      rows.push({ type: 'productRow', products: [pendingProduct] });
    }
    return rows;
  }, [feedItems]);

  // Render a row item (section header or product pair)
  const renderRowItem = useCallback(({ item }: { item: RowItem }) => {
    if (item.type === 'section') {
      return (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLine} />
          <Text style={styles.sectionLabel}>{item.label}</Text>
          <View style={styles.sectionLine} />
        </View>
      );
    }

    const [first, second] = item.products;
    return (
      <View style={styles.rowWrapper}>
        <View style={styles.cardWrapper}>
          <ProductCard
            product={first}
            onPress={() => handleProductPress(first.id)}
            onLike={() => handleToggleLike(first.id)}
            onBrandPress={() => handleBrandPress(first.brand?.slug || '')}
            onLongPress={() => handleLongPressItem({ id: first.id, name: first.name })}
          />
        </View>
        {second ? (
          <View style={styles.cardWrapper}>
            <ProductCard
              product={second}
              onPress={() => handleProductPress(second.id)}
              onLike={() => handleToggleLike(second.id)}
              onBrandPress={() => handleBrandPress(second.brand?.slug || '')}
              onLongPress={() => handleLongPressItem({ id: second.id, name: second.name })}
            />
          </View>
        ) : (
          <View style={styles.cardWrapper} />
        )}
      </View>
    );
  }, [handleProductPress, handleToggleLike, handleBrandPress, handleLongPressItem]);

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

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
        data={rowItems}
        keyExtractor={(item, index) =>
          item.type === 'section' ? `section-${item.dayOffset}` : `row-${index}-${item.products[0].id}`
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          scrollPositionRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={true}
        initialNumToRender={6}
        updateCellsBatchingPeriod={50}
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
        renderItem={renderRowItem}
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
