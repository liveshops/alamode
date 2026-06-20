import { AddToCollectionSheet } from '@/components/AddToCollectionSheet';
import { ProductCard } from '@/components/ProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { useHomeRefresh } from '@/contexts/HomeRefreshContext';
import { useRecommendations } from '@/hooks/useRecommendations';
import { requireAuth } from '@/utils/authGuard';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Platform, RefreshControl, StyleSheet, Text, TouchableOpacity, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { products, loading, loadingMore, error, hasMore, refetch, loadMore, toggleLike, markNotInterested } = useRecommendations(20);
  const [refreshing, setRefreshing] = useState(false);
  const [collectionSheetVisible, setCollectionSheetVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const scrollPositionRef = useRef(0);
  const prefetchedUrls = useRef<Set<string>>(new Set());
  const { registerRefresh } = useHomeRefresh();


  // Function to scroll to top and refresh
  const scrollToTopAndRefresh = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    scrollPositionRef.current = 0;
    refetch();
  }, [refetch]);

  // Register the refresh callback with the tab layout
  useEffect(() => {
    registerRefresh(scrollToTopAndRefresh);
  }, [registerRefresh, scrollToTopAndRefresh]);

  // Restore scroll position when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (scrollPositionRef.current > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: scrollPositionRef.current,
            animated: false,
          });
        }, 100);
      }
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };


  const handleBrandPress = useCallback((brandSlug: string) => {
    router.push(`/brand/${brandSlug}`);
  }, [router]);

  const handleProductPress = useCallback((productId: string) => {
    router.push(`/product/${productId}`);
  }, [router]);

  const handleToggleLike = useCallback((productId: string) => {
    if (!requireAuth(user, 'like products')) return;
    toggleLike(productId);
  }, [toggleLike, user]);

  const handleLongPressItem = useCallback((product: { id: string; name: string }) => {
    if (!requireAuth(user, 'save products')) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Not Interested', 'Add to Collection'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
        },
        (buttonIndex: number) => {
          if (buttonIndex === 1) {
            // Not Interested
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            markNotInterested(product.id);
          } else if (buttonIndex === 2) {
            // Add to Collection
            setSelectedProduct(product);
            setCollectionSheetVisible(true);
          }
        }
      );
    } else {
      // Android fallback
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
  }, [markNotInterested, user]);

  // Keep a ref of the latest products so the (stable) viewability callback always
  // reads current data. FlatList only binds onViewableItemsChanged once, so it must
  // not depend on changing closures.
  const productsRef = useRef(products);
  productsRef.current = products;

  // Track visible items and prefetch upcoming images to DISK only: this warms the
  // network + disk cache (the slow part) without inflating in-memory bitmap RAM.
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length === 0) return;
    const lastVisibleIndex = Math.max(...viewableItems.map(item => item.index ?? 0));
    const startIndex = lastVisibleIndex + 4;
    const list = productsRef.current;
    const PREFETCH_COUNT = 6;
    const endIndex = Math.min(startIndex + PREFETCH_COUNT, list.length);

    // Clear old prefetch tracking if it grows too large to prevent memory leaks
    if (prefetchedUrls.current.size > 200) {
      prefetchedUrls.current.clear();
    }

    for (let i = startIndex; i < endIndex; i++) {
      const product = list[i];
      if (product?.image_url && !prefetchedUrls.current.has(product.image_url)) {
        prefetchedUrls.current.add(product.image_url);
        Image.prefetch(getOptimizedImageUrl(product.image_url), 'disk');
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
    minimumViewTime: 100,
  }).current;

  // Memoized render function to prevent unnecessary re-renders
  const renderProductItem = useCallback(({ item, index }: { item: any; index: number }) => (
    <View style={styles.cardWrapper}>
      <ProductCard
        product={item}
        priority={index < 6 ? 'high' : 'normal'}
        onPress={() => handleProductPress(item.id)}
        onLike={() => handleToggleLike(item.id)}
        onBrandPress={() => handleBrandPress(item.brand.slug)}
        onLongPress={() => handleLongPressItem({ id: item.id, name: item.name })}
      />
    </View>
  ), [handleProductPress, handleToggleLike, handleBrandPress, handleLongPressItem]);

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error loading products</Text>
        <Text style={styles.errorSubtext}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={scrollToTopAndRefresh} activeOpacity={0.7}>
          <Text style={styles.appName}>cherry</Text>
        </TouchableOpacity>
      </View>

      {/* Product Grid */}
      <FlatList
        ref={flatListRef}
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          scrollPositionRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onEndReached={() => {
          if (hasMore && !loadingMore) {
            loadMore();
          }
        }}
        onEndReachedThreshold={0.5}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Your personalized feed</Text>
            <Text style={styles.emptySubtext}>
              Like products and follow brands to get personalized recommendations!
            </Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#000" />
            </View>
          ) : null
        }
        renderItem={renderProductItem}
      />

      {/* Add to Collection Sheet */}
      {selectedProduct && (
        <AddToCollectionSheet
          visible={collectionSheetVisible}
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          onClose={() => {
            setCollectionSheetVisible(false);
            setSelectedProduct(null);
          }}
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
    paddingBottom: 20,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  appName: {
    fontFamily: 'AbrilFatface-Regular',
    fontSize: 32,
    textAlign: 'center',
    letterSpacing: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 100,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  cardWrapper: {
    flex: 1,
    maxWidth: '48%',
    marginHorizontal: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
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
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
