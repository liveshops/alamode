import { AddToCollectionSheet } from '@/components/AddToCollectionSheet';
import { ProductCard } from '@/components/ProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { requireAuth } from '@/utils/authGuard';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website_url: string;
  follower_count: number;
}

const PAGE_SIZE = 40;

export default function BrandProfileScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [brand, setBrand] = useState<Brand | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProductCount, setTotalProductCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('popular');
  const [collectionSheetVisible, setCollectionSheetVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const scrollPositionRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const loadedSlugRef = useRef<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      const needsFetch = !hasLoadedRef.current || loadedSlugRef.current !== slug;
      
      if (needsFetch) {
        hasLoadedRef.current = true;
        loadedSlugRef.current = slug;
        fetchBrandInfo();
      } else if (scrollPositionRef.current > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: scrollPositionRef.current,
            animated: false,
          });
        }, 50);
      }
    }, [slug, user])
  );

  // Fetch brand info + first page of products
  const fetchBrandInfo = async () => {
    if (!slug) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch brand info
      const { data: brandData, error: brandError } = await supabase
        .from('brands')
        .select('*')
        .eq('slug', slug)
        .single();

      if (brandError) throw brandError;
      setBrand(brandData);

      // Get total product count and check follow status in parallel
      const [countResult, followResult] = await Promise.all([
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('brand_id', brandData.id)
          .eq('is_available', true),
        user
          ? supabase
              .from('user_follows_brands')
              .select('brand_id')
              .eq('user_id', user.id)
              .eq('brand_id', brandData.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setTotalProductCount(countResult.count || 0);
      setIsFollowing(!!followResult.data);

      // Fetch first page of products
      await fetchProducts(brandData.id, sortBy, '', 0, true);
    } catch (err) {
      console.error('Error fetching brand:', err);
      setError(err instanceof Error ? err.message : 'Failed to load brand');
    } finally {
      setLoading(false);
    }
  };

  // Fetch a page of products with server-side sort, search, and like status
  const fetchProducts = async (
    brandId: string,
    sort: 'newest' | 'popular',
    search: string,
    offset: number,
    reset: boolean
  ) => {
    let query = supabase
      .from('products')
      .select(`
        id, name, price, sale_price, currency, image_url, additional_images, product_url, like_count, created_at,
        brand:brands(id, name, slug, logo_url)
      `)
      .eq('brand_id', brandId)
      .eq('is_available', true);

    // Server-side search
    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    // Server-side sort
    if (sort === 'popular') {
      query = query.order('like_count', { ascending: false }).order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data: productsData, error: productsError } = await query
      .range(offset, offset + PAGE_SIZE - 1);

    if (productsError) throw productsError;

    let productsWithLikes = productsData || [];

    // Check likes only for this page of products
    if (user && productsWithLikes.length > 0) {
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

    if (reset) {
      setProducts(productsWithLikes as unknown as Product[]);
    } else {
      setProducts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newProducts = productsWithLikes.filter(p => !existingIds.has(p.id));
        return [...prev, ...newProducts] as unknown as Product[];
      });
    }
    setHasMore(productsWithLikes.length >= PAGE_SIZE);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || !brand) return;
    setLoadingMore(true);
    try {
      await fetchProducts(brand.id, sortBy, debouncedSearch, products.length, false);
    } catch (err) {
      console.error('Error loading more products:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = async () => {
    if (!brand) return;
    setRefreshing(true);
    await fetchProducts(brand.id, sortBy, debouncedSearch, 0, true);
    setRefreshing(false);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // Debounce search to avoid firing on every keystroke
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(query);
    }, 400);
  };

  // Re-fetch when sort or debounced search changes
  const handleSortChange = (sort: 'newest' | 'popular') => {
    if (sort === sortBy) return;
    setSortBy(sort);
    if (brand) {
      setLoading(true);
      fetchProducts(brand.id, sort, debouncedSearch, 0, true).finally(() => setLoading(false));
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  };

  const handleToggleFollow = async () => {
    if (!requireAuth(user, 'follow brands')) return;
    if (!brand) return;

    const wasFollowing = isFollowing;

    // Optimistic update
    setIsFollowing(!wasFollowing);
    setBrand((prev) =>
      prev
        ? {
            ...prev,
            follower_count: wasFollowing ? prev.follower_count - 1 : prev.follower_count + 1,
          }
        : null
    );

    try {
      if (wasFollowing) {
        await supabase
          .from('user_follows_brands')
          .delete()
          .eq('user_id', user.id)
          .eq('brand_id', brand.id);
      } else {
        const { error } = await supabase
          .from('user_follows_brands')
          .upsert(
            { user_id: user.id, brand_id: brand.id },
            { onConflict: 'user_id,brand_id', ignoreDuplicates: true }
          );

        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      // Revert on error
      setIsFollowing(wasFollowing);
      setBrand((prev) =>
        prev
          ? {
              ...prev,
              follower_count: wasFollowing ? prev.follower_count + 1 : prev.follower_count - 1,
            }
          : null
      );
    }
  };

  // Re-fetch when debounced search changes
  useEffect(() => {
    if (brand && hasLoadedRef.current) {
      fetchProducts(brand.id, sortBy, debouncedSearch, 0, true);
    }
  }, [debouncedSearch]);

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const handleToggleLike = async (productId: string) => {
    if (!requireAuth(user, 'like products')) return;

    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const wasLiked = product.is_liked;

    // Optimistic update
    const updateProducts = (prev: Product[]) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              is_liked: !wasLiked,
              like_count: wasLiked ? Math.max(0, p.like_count - 1) : p.like_count + 1,
            }
          : p
      );

    setProducts(updateProducts);

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
      const revertProducts = (prev: Product[]) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                is_liked: wasLiked,
                like_count: wasLiked ? p.like_count + 1 : Math.max(0, p.like_count - 1),
              }
            : p
        );

      setProducts(revertProducts);
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (error || !brand) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Failed to load brand</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/')} activeOpacity={0.7}>
          <Text style={styles.headerTitle}>cherry</Text>
        </TouchableOpacity>
        <View style={styles.backButton} />
      </View>

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
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
        }
        ListHeaderComponent={
          <View style={styles.brandHeader}>
            {/* Brand Logo */}
            {brand.logo_url ? (
              <Image source={{ uri: brand.logo_url }} style={styles.brandLogo} resizeMode="contain" />
            ) : (
              <View style={styles.brandLogoPlaceholder}>
                <Text style={styles.brandLogoText}>{brand.name[0]}</Text>
              </View>
            )}

            {/* Brand Name */}
            <Text style={styles.brandName}>{brand.name}</Text>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{brand.follower_count}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{totalProductCount}</Text>
                <Text style={styles.statLabel}>Products</Text>
              </View>
            </View>

            {/* Follow Button */}
            <TouchableOpacity
              style={[styles.followButton, isFollowing && styles.followingButton]}
              onPress={handleToggleFollow}
              activeOpacity={0.7}>
              <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color="#999" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search"
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={handleSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => handleSearch('')}>
                  <Ionicons name="close-circle" size={18} color="#999" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Sort Toggle */}
            <View style={styles.sortContainer}>
              <TouchableOpacity
                style={[styles.sortButton, sortBy === 'newest' && styles.sortButtonActive]}
                onPress={() => handleSortChange('newest')}
                activeOpacity={0.7}>
                <Text style={[styles.sortButtonText, sortBy === 'newest' && styles.sortButtonTextActive]}>
                  NEWEST
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortButton, sortBy === 'popular' && styles.sortButtonActive]}
                onPress={() => handleSortChange('popular')}
                activeOpacity={0.7}>
                <Text style={[styles.sortButtonText, sortBy === 'popular' && styles.sortButtonTextActive]}>
                  MOST LIKED
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
              <Text style={styles.emptyText}>
                {debouncedSearch ? 'No products match your search' : 'No products yet'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrapper}>
            <ProductCard
              product={item}
              onPress={() => handleProductPress(item.id)}
              onLike={() => handleToggleLike(item.id)}
              onLongPress={() => {
                setSelectedProduct({ id: item.id, name: item.name });
                setCollectionSheetVisible(true);
              }}
            />
          </View>
        )}
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
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  backLink: {
    fontSize: 16,
    color: '#000',
    textDecorationLine: 'underline',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontFamily: 'AbrilFatface-Regular',
    fontSize: 24,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  brandHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 16,
  },
  brandLogo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  brandLogoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandLogoText: {
    fontSize: 40,
    fontWeight: '600',
    color: '#fff',
  },
  brandName: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 48,
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  followButton: {
    paddingHorizontal: 48,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 0,
    backgroundColor: '#000',
    minWidth: 200,
  },
  followingButton: {
    backgroundColor: '#fff',
  },
  followButtonText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    color: '#fff',
  },
  followingButtonText: {
    color: '#000',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 20,
    width: '100%',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  sortContainer: {
    flexDirection: 'row',
    marginTop: 16,
    width: '100%',
  },
  sortButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  sortButtonActive: {
    borderBottomColor: '#000',
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
    letterSpacing: 0.5,
  },
  sortButtonTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  row: {
    justifyContent: 'space-between',
    gap: 16,
  },
  cardWrapper: {
    flex: 1,
    maxWidth: '48%',
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
