import { BrandRowCard } from '@/components/BrandRowCard';
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
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BrandWithProducts {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  follower_count: number;
  products: Product[];
}

export default function ShopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [brands, setBrands] = useState<BrandWithProducts[]>([]);
  const [followedBrandIds, setFollowedBrandIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollPositionRef = useRef(0);
  const shouldRestoreScroll = useRef(false);
  const BRANDS_PER_PAGE = 10;

  useFocusEffect(
    useCallback(() => {
      shouldRestoreScroll.current = scrollPositionRef.current > 0;
      fetchBrands();
    }, [user])
  );

  const fetchBrands = async (reset = true) => {
    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      }

      const currentOffset = reset ? 0 : offset;

      // Use optimized database function with pagination
      const { data: brandsData, error: brandsError } = await supabase
        .rpc('get_shop_brands', {
          p_user_id: user?.id || null,
          p_products_per_brand: 6,
          p_limit: BRANDS_PER_PAGE,
          p_offset: currentOffset
        });

      if (brandsError) throw brandsError;

      // Process brands data - products are already included as JSONB
      const brandsWithProducts = (brandsData || []).map((brand: any) => ({
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        logo_url: brand.logo_url,
        follower_count: brand.follower_count,
        products: brand.products || [],
      }));

      if (reset) {
        setBrands(brandsWithProducts);
        setOffset(BRANDS_PER_PAGE);
      } else {
        // Filter out duplicates before appending
        setBrands(prev => {
          const existingIds = new Set(prev.map(b => b.id));
          const newBrands = brandsWithProducts.filter((b: BrandWithProducts) => !existingIds.has(b.id));
          return [...prev, ...newBrands];
        });
        setOffset(prev => prev + BRANDS_PER_PAGE);
      }

      setHasMore(brandsWithProducts.length === BRANDS_PER_PAGE);

      // Set followed brands from the is_following field returned by the function
      if (user && brandsData) {
        const newFollowedIds = brandsData
          .filter((bd: any) => bd.is_following)
          .map((bd: any) => bd.id as string);
        
        if (reset) {
          setFollowedBrandIds(new Set(newFollowedIds));
        } else {
          setFollowedBrandIds(prev => new Set([...prev, ...newFollowedIds]));
        }
      } else if (reset) {
        setFollowedBrandIds(new Set());
      }
    } catch (err) {
      console.error('Error fetching brands:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      // Restore scroll after data loads
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
    await fetchBrands(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBrands();
    setRefreshing(false);
  };

  const handleToggleFollow = async (brandId: string) => {
    if (!user) return;

    const wasFollowing = followedBrandIds.has(brandId);

    // Optimistic update
    setFollowedBrandIds((prev) => {
      const newSet = new Set(prev);
      if (wasFollowing) {
        newSet.delete(brandId);
      } else {
        newSet.add(brandId);
      }
      return newSet;
    });

    // Update follower count optimistically
    setBrands((prev) =>
      prev.map((b) =>
        b.id === brandId
          ? {
              ...b,
              follower_count: wasFollowing ? b.follower_count - 1 : b.follower_count + 1,
            }
          : b
      )
    );

    try {
      if (wasFollowing) {
        await supabase
          .from('user_follows_brands')
          .delete()
          .eq('user_id', user.id)
          .eq('brand_id', brandId);
      } else {
        const { error } = await supabase
          .from('user_follows_brands')
          .upsert(
            { user_id: user.id, brand_id: brandId },
            { onConflict: 'user_id,brand_id', ignoreDuplicates: true }
          );

        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      // Revert on error
      setFollowedBrandIds((prev) => {
        const newSet = new Set(prev);
        if (wasFollowing) {
          newSet.add(brandId);
        } else {
          newSet.delete(brandId);
        }
        return newSet;
      });

      setBrands((prev) =>
        prev.map((b) =>
          b.id === brandId
            ? {
                ...b,
                follower_count: wasFollowing ? b.follower_count + 1 : b.follower_count - 1,
              }
            : b
        )
      );
    }
  };

  const handleBrandPress = (brandSlug: string) => {
    router.push(`/brand/${brandSlug}`);
  };

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const handleToggleLike = async (productId: string) => {
    if (!user) return;

    // Find the product in brands
    let product: Product | undefined;
    let brandId: string | undefined;
    
    for (const brand of brands) {
      const foundProduct = brand.products.find((p) => p.id === productId);
      if (foundProduct) {
        product = foundProduct;
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
        const { error } = await supabase
          .from('user_likes_products')
          .upsert(
            { user_id: user.id, product_id: productId },
            { onConflict: 'user_id,product_id', ignoreDuplicates: true }
          );

        if (error) throw error;
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.appName}>cherry</Text>
      </View>

      {/* Brands List */}
      <FlatList
        ref={flatListRef}
        data={brands}
        keyExtractor={(item) => item.id}
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
            <Text style={styles.emptyText}>No brands available</Text>
          </View>
        }
        renderItem={({ item }) => (
          <BrandRowCard
            brandName={item.name}
            brandSlug={item.slug}
            isFollowing={followedBrandIds.has(item.id)}
            followerCount={item.follower_count}
            products={item.products}
            onBrandPress={() => handleBrandPress(item.slug)}
            onToggleFollow={() => handleToggleFollow(item.id)}
            onProductPress={handleProductPress}
            onToggleLike={handleToggleLike}
          />
        )}
      />
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
    paddingTop: 16,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
