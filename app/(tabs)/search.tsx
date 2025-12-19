import { BrandRowCard } from '@/components/BrandRowCard';
import { ProductCard } from '@/components/ProductCard';
import { UserCard } from '@/components/UserCard';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { RecommendedProduct } from '@/hooks/useRecommendations';
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
    TextInput,
    TouchableOpacity,
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

interface User {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  follower_count: number;
}

type TabType = 'for_you' | 'most_liked' | 'brands' | 'users';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const searchInputRef = useRef<TextInput>(null);

  const [activeTab, setActiveTab] = useState<TabType>('for_you');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [forYouProducts, setForYouProducts] = useState<RecommendedProduct[]>([]);
  const [brands, setBrands] = useState<BrandWithProducts[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [followedBrandIds, setFollowedBrandIds] = useState<Set<string>>(new Set());
  const [followedUserIds, setFollowedUserIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forYouOffset, setForYouOffset] = useState(0);
  const [forYouHasMore, setForYouHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [brandsOffset, setBrandsOffset] = useState(0);
  const [brandsHasMore, setBrandsHasMore] = useState(true);
  const [loadingMoreBrands, setLoadingMoreBrands] = useState(false);
  const BRANDS_PER_PAGE = 10;

  // Scroll position refs for each tab
  const forYouListRef = useRef<FlatList>(null);
  const mostLikedListRef = useRef<FlatList>(null);
  const brandsListRef = useRef<FlatList>(null);
  const usersListRef = useRef<FlatList>(null);
  const forYouScrollRef = useRef(0);
  const mostLikedScrollRef = useRef(0);
  const brandsScrollRef = useRef(0);
  const usersScrollRef = useRef(0);
  const shouldRestoreScroll = useRef<TabType | null>(null);

  // Handle search submit (when user presses return)
  const handleSearchSubmit = () => {
    setDebouncedQuery(searchQuery);
  };

  useFocusEffect(
    useCallback(() => {
      // Mark which tab needs scroll restoration
      if (activeTab === 'for_you' && forYouScrollRef.current > 0) {
        shouldRestoreScroll.current = 'for_you';
      } else if (activeTab === 'most_liked' && mostLikedScrollRef.current > 0) {
        shouldRestoreScroll.current = 'most_liked';
      } else if (activeTab === 'brands' && brandsScrollRef.current > 0) {
        shouldRestoreScroll.current = 'brands';
      } else if (activeTab === 'users' && usersScrollRef.current > 0) {
        shouldRestoreScroll.current = 'users';
      }
      fetchData();
    }, [user, debouncedQuery, activeTab])
  );

  const fetchData = async () => {
    if (!user) {
      setProducts([]);
      setBrands([]);
      setUsers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch user's followed brands and users
      const [followedBrandsRes, followedUsersRes] = await Promise.all([
        supabase
          .from('user_follows_brands')
          .select('brand_id')
          .eq('user_id', user.id),
        supabase
          .from('user_follows_users')
          .select('following_id')
          .eq('follower_id', user.id),
      ]);

      const followedBrandIdsSet = new Set(
        followedBrandsRes.data?.map((f) => f.brand_id) || []
      );
      const followedUserIdsSet = new Set(
        followedUsersRes.data?.map((f) => f.following_id) || []
      );

      setFollowedBrandIds(followedBrandIdsSet);
      setFollowedUserIds(followedUserIdsSet);

      if (activeTab === 'for_you') {
        await fetchForYouProducts();
      } else if (activeTab === 'most_liked') {
        await fetchProducts(followedBrandIdsSet);
      } else if (activeTab === 'brands') {
        await fetchBrands();
      } else if (activeTab === 'users') {
        await fetchUsers();
      }
    } catch (err) {
      console.error('Error fetching search data:', err);
    } finally {
      setLoading(false);
      // Restore scroll after data loads
      if (shouldRestoreScroll.current) {
        setTimeout(() => {
          switch (shouldRestoreScroll.current) {
            case 'for_you':
              forYouListRef.current?.scrollToOffset({
                offset: forYouScrollRef.current,
                animated: false,
              });
              break;
            case 'most_liked':
              mostLikedListRef.current?.scrollToOffset({
                offset: mostLikedScrollRef.current,
                animated: false,
              });
              break;
            case 'brands':
              brandsListRef.current?.scrollToOffset({
                offset: brandsScrollRef.current,
                animated: false,
              });
              break;
            case 'users':
              usersListRef.current?.scrollToOffset({
                offset: usersScrollRef.current,
                animated: false,
              });
              break;
          }
          shouldRestoreScroll.current = null;
        }, 300);
      }
    }
  };

  const fetchForYouProducts = async (reset = true) => {
    try {
      const offset = reset ? 0 : forYouOffset;
      
      let productsData: any[] = [];

      // If searching, query products directly with server-side filter
      if (debouncedQuery) {
        const { data: searchData, error: searchError } = await supabase
          .from('products')
          .select(`
            id, name, price, sale_price, image_url, product_url, like_count, taxonomy_category_name,
            brand:brands(id, name, slug)
          `)
          .ilike('name', `%${debouncedQuery}%`)
          .eq('is_available', true)
          .order('like_count', { ascending: false })
          .limit(50);

        if (searchError) throw searchError;

        // Check which products are liked
        let products = searchData || [];
        if (user && products.length > 0) {
          const { data: likedData } = await supabase
            .from('user_likes_products')
            .select('product_id')
            .eq('user_id', user.id)
            .in('product_id', products.map((p: any) => p.id));

          const likedIds = new Set(likedData?.map(l => l.product_id) || []);
          products = products.map((p: any) => ({ 
            ...p, 
            is_liked: likedIds.has(p.id),
            is_liked_by_user: likedIds.has(p.id),
            product_id: p.id,
            brand_id: p.brand?.id,
            brand_name: p.brand?.name,
            brand_slug: p.brand?.slug,
          }));
        }

        productsData = products;
        setForYouProducts(productsData.map((item: any) => ({
          ...item,
          id: item.id,
          is_liked: item.is_liked,
          brand: item.brand || { id: item.brand_id, name: item.brand_name, slug: item.brand_slug },
        })));
        setForYouHasMore(false); // No pagination for search results
      } else {
        // No search - use personalized recommendations algorithm
        const { data, error } = await supabase.rpc('get_recommendations', {
          target_user_id: user!.id,
          result_limit: 20,
          offset_val: offset,
        });

        if (error) throw error;

        productsData = data || [];

        // Map to expected format with nested brand object
        const mappedProducts: RecommendedProduct[] = productsData.map((item: any) => ({
          ...item,
          id: item.product_id,
          is_liked: item.is_liked_by_user,
          brand: {
            id: item.brand_id,
            name: item.brand_name,
            slug: item.brand_slug,
          },
        }));

        if (reset) {
          setForYouProducts(mappedProducts);
          setForYouOffset(20);
        } else {
          setForYouProducts(prev => [...prev, ...mappedProducts]);
          setForYouOffset(prev => prev + 20);
        }
        
        setForYouHasMore(mappedProducts.length === 20);
      }
    } catch (err) {
      console.error('Error fetching recommendations:', err);
    }
  };

  const loadMoreForYou = async () => {
    if (loadingMore || !forYouHasMore) return;
    setLoadingMore(true);
    await fetchForYouProducts(false);
    setLoadingMore(false);
  };

  const fetchProducts = async (followedBrandIdsSet: Set<string>) => {
    try {
      // Most liked - use optimized function
      const { data, error } = await supabase
        .rpc('search_most_liked_products', {
          p_user_id: user!.id,
          p_search_query: debouncedQuery || null,
          p_limit: 50
        });

      if (error) throw error;

      const productsWithBrand = (data || []).map((product: any) => ({
        ...product,
        brand: {
          id: product.brand_id,
          name: product.brand_name,
          slug: product.brand_slug,
          logo_url: product.brand_logo_url,
        },
      }));

      setProducts(productsWithBrand);
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchBrands = async (reset = true) => {
    try {
      const currentOffset = reset ? 0 : brandsOffset;

      let brandsData: any[] = [];

      // If searching, query brands directly with server-side filter
      if (debouncedQuery) {
        const { data: searchData, error: searchError } = await supabase
          .from('brands')
          .select('id, name, slug, logo_url, follower_count')
          .ilike('name', `%${debouncedQuery}%`)
          .order('follower_count', { ascending: false })
          .limit(50);

        if (searchError) throw searchError;

        // For searched brands, fetch their products separately
        const brandsWithProducts = await Promise.all(
          (searchData || []).map(async (brand: any) => {
            const { data: productsData } = await supabase
              .from('products')
              .select(`
                id, name, price, sale_price, currency, image_url, product_url, like_count,
                brand:brands(id, name, slug, logo_url)
              `)
              .eq('brand_id', brand.id)
              .eq('is_available', true)
              .order('like_count', { ascending: false })
              .limit(6);

            // Check which products are liked
            let products = productsData || [];
            if (user && products.length > 0) {
              const { data: likedData } = await supabase
                .from('user_likes_products')
                .select('product_id')
                .eq('user_id', user.id)
                .in('product_id', products.map(p => p.id));

              const likedIds = new Set(likedData?.map(l => l.product_id) || []);
              products = products.map(p => ({ ...p, is_liked: likedIds.has(p.id) }));
            }

            return { ...brand, products };
          })
        );

        brandsData = brandsWithProducts;
        setBrands(brandsData);
        setBrandsHasMore(false); // No pagination for search results
      } else {
        // No search - use optimized paginated function
        const { data, error } = await supabase
          .rpc('get_shop_brands', {
            p_user_id: user!.id,
            p_products_per_brand: 6,
            p_limit: BRANDS_PER_PAGE,
            p_offset: currentOffset
          });

        if (error) throw error;

        brandsData = data || [];

        // Process brands data
        const brandsWithProducts: BrandWithProducts[] = brandsData.map((brand: any) => ({
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          logo_url: brand.logo_url,
          follower_count: brand.follower_count,
          products: brand.products || [],
        }));

        if (reset) {
          setBrands(brandsWithProducts);
          setBrandsOffset(BRANDS_PER_PAGE);
        } else {
          // Filter out duplicates
          setBrands(prev => {
            const existingIds = new Set(prev.map(b => b.id));
            const newBrands = brandsWithProducts.filter(b => !existingIds.has(b.id));
            return [...prev, ...newBrands];
          });
          setBrandsOffset(prev => prev + BRANDS_PER_PAGE);
        }

        setBrandsHasMore(brandsWithProducts.length === BRANDS_PER_PAGE);
      }
    } catch (err) {
      console.error('Error fetching brands:', err);
    } finally {
      setLoadingMoreBrands(false);
    }
  };

  const loadMoreBrands = async () => {
    if (loadingMoreBrands || !brandsHasMore) return;
    setLoadingMoreBrands(true);
    await fetchBrands(false);
  };

  const fetchUsers = async () => {
    try {
      let query = supabase.from('profiles').select('id, display_name, username, avatar_url, follower_count');

      // Apply search filter if there's a query
      if (debouncedQuery) {
        query = query.or(
          `display_name.ilike.%${debouncedQuery}%,username.ilike.%${debouncedQuery}%`
        );
      }

      // Order by popularity (follower count) and limit results
      query = query
        .neq('id', user!.id)
        .order('follower_count', { ascending: false })
        .limit(50);

      const { data, error } = await query;

      if (error) throw error;

      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const handleBrandPress = (brandSlug: string) => {
    router.push(`/brand/${brandSlug}`);
  };

  const handleToggleLikeProduct = async (productId: string) => {
    if (!user) return;

    // Check both product lists
    const product = products.find((p) => p.id === productId);
    const forYouProduct = forYouProducts.find((p) => p.id === productId);
    const targetProduct = product || forYouProduct;
    if (!targetProduct) return;

    const wasLiked = targetProduct.is_liked ?? false;
    const newLikedState = !wasLiked;
    const newLikeCount = wasLiked ? Math.max(0, targetProduct.like_count - 1) : targetProduct.like_count + 1;

    // Optimistic update for both lists
    if (product) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? { ...p, is_liked: newLikedState, like_count: newLikeCount }
            : p
        )
      );
    }
    if (forYouProduct) {
      setForYouProducts((prev) =>
        prev.map((p): RecommendedProduct =>
          p.id === productId
            ? { ...p, is_liked: newLikedState, is_liked_by_user: newLikedState, like_count: newLikeCount }
            : p
        )
      );
    }

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
      const revertLikeCount = wasLiked ? targetProduct.like_count + 1 : Math.max(0, targetProduct.like_count - 1);
      if (product) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === productId
              ? { ...p, is_liked: wasLiked, like_count: revertLikeCount }
              : p
          )
        );
      }
      if (forYouProduct) {
        setForYouProducts((prev) =>
          prev.map((p): RecommendedProduct =>
            p.id === productId
              ? { ...p, is_liked: wasLiked, is_liked_by_user: wasLiked, like_count: revertLikeCount }
              : p
          )
        );
      }
    }
  };

  const handleToggleLikeProductInBrand = async (productId: string) => {
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

  const handleToggleFollowBrand = async (brandId: string) => {
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

  const handleToggleFollowUser = async (userId: string) => {
    if (!user) return;

    const wasFollowing = followedUserIds.has(userId);

    // Optimistic update
    setFollowedUserIds((prev) => {
      const newSet = new Set(prev);
      if (wasFollowing) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });

    try {
      if (wasFollowing) {
        await supabase
          .from('user_follows_users')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);
      } else {
        const { error } = await supabase
          .from('user_follows_users')
          .upsert(
            { follower_id: user.id, following_id: userId },
            { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
          );

        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      // Revert on error
      setFollowedUserIds((prev) => {
        const newSet = new Set(prev);
        if (wasFollowing) {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });
    }
  };

  const renderProductsList = () => {
    const isForYou = activeTab === 'for_you';
    const displayProducts = isForYou ? forYouProducts : products;

    return (
    <FlatList
      ref={isForYou ? forYouListRef : mostLikedListRef}
      key="products-grid"
      data={displayProducts}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.productRow}
      contentContainerStyle={styles.productListContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => {
        const scrollPos = e.nativeEvent.contentOffset.y;
        if (activeTab === 'for_you') {
          forYouScrollRef.current = scrollPos;
        } else {
          mostLikedScrollRef.current = scrollPos;
        }
      }}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {debouncedQuery
              ? "We couldn't find any products"
              : activeTab === 'for_you'
              ? 'Follow some brands to see products here'
              : 'No products available'}
          </Text>
          {debouncedQuery && (
            <Text style={styles.emptySubtext}>
              Try searching for something else or browse our popular products
            </Text>
          )}
        </View>
      }
      onEndReached={isForYou ? loadMoreForYou : undefined}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        isForYou && loadingMore ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator size="small" color="#000" />
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <View style={styles.productCardWrapper}>
          <ProductCard
            product={item as any}
            onPress={() => handleProductPress(item.id)}
            onLike={() => handleToggleLikeProduct(item.id)}
            onBrandPress={() => handleBrandPress(item.brand.slug)}
          />
        </View>
      )}
    />
  );
  };

  const renderBrandsList = () => (
    <FlatList
      ref={brandsListRef}
      key="brands-list"
      data={brands}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.brandListContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => {
        brandsScrollRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      onEndReached={loadMoreBrands}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListFooterComponent={
        loadingMoreBrands ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator size="small" color="#000" />
          </View>
        ) : null
      }
      ListEmptyComponent={
        loading ? null : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {debouncedQuery ? "No brands match your search" : 'No brands available yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {debouncedQuery 
                ? 'Try a different search term'
                : 'Check out the Shop tab to discover brands'}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        <BrandRowCard
          brandName={item.name}
          brandSlug={item.slug}
          isFollowing={followedBrandIds.has(item.id)}
          followerCount={item.follower_count}
          products={item.products}
          onBrandPress={() => handleBrandPress(item.slug)}
          onToggleFollow={() => handleToggleFollowBrand(item.id)}
          onProductPress={handleProductPress}
          onToggleLike={handleToggleLikeProductInBrand}
        />
      )}
    />
  );

  const renderUsersList = () => (
    <FlatList
      ref={usersListRef}
      key="users-list"
      data={users}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.userListContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => {
        usersScrollRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListEmptyComponent={
        loading ? null : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {debouncedQuery ? "No users match your search" : 'No users to show yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {debouncedQuery 
                ? 'Try a different name or username'
                : 'Be the first to invite your friends!'}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        <UserCard
          user={item}
          isFollowing={followedUserIds.has(item.id)}
          onPress={() => router.push(`/user/${item.id}`)}
          onToggleFollow={() => handleToggleFollowUser(item.id)}
        />
      )}
    />
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Search */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setDebouncedQuery('');
                searchInputRef.current?.blur();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'for_you' && styles.tabActive]}
          onPress={() => setActiveTab('for_you')}
          activeOpacity={0.7}>
          <Text style={[styles.tabText, activeTab === 'for_you' && styles.tabTextActive]}>
            For You
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'most_liked' && styles.tabActive]}
          onPress={() => setActiveTab('most_liked')}
          activeOpacity={0.7}>
          <Text style={[styles.tabText, activeTab === 'most_liked' && styles.tabTextActive]}>
            Most Liked
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'brands' && styles.tabActive]}
          onPress={() => setActiveTab('brands')}
          activeOpacity={0.7}>
          <Text style={[styles.tabText, activeTab === 'brands' && styles.tabTextActive]}>
            Brands
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.tabActive]}
          onPress={() => setActiveTab('users')}
          activeOpacity={0.7}>
          <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
            Users
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'for_you' || activeTab === 'most_liked'
        ? renderProductsList()
        : activeTab === 'brands'
        ? renderBrandsList()
        : renderUsersList()}
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  cancelText: {
    fontSize: 16,
    color: '#007AFF',
    marginLeft: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#000',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  tabTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  productListContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  productRow: {
    justifyContent: 'space-between',
  },
  productCardWrapper: {
    flex: 1,
    maxWidth: '48%',
    marginBottom: 24,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  brandListContent: {
    paddingTop: 16,
  },
  userListContent: {
    paddingTop: 8,
  },
  emptyContainer: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
