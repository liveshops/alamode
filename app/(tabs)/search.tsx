import { BrandRowCard } from '@/components/BrandRowCard';
import { ProductCard } from '@/components/ProductCard';
import { UserCard } from '@/components/UserCard';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [brands, setBrands] = useState<BrandWithProducts[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [followedBrandIds, setFollowedBrandIds] = useState<Set<string>>(new Set());
  const [followedUserIds, setFollowedUserIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useFocusEffect(
    useCallback(() => {
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

      if (activeTab === 'for_you' || activeTab === 'most_liked') {
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
    }
  };

  const fetchProducts = async (followedBrandIdsSet: Set<string>) => {
    try {
      let query = supabase
        .from('products')
        .select(
          `
          *,
          brand:brands(id, name, slug, logo_url)
        `
        )
        .eq('is_available', true);

      // Apply search filter
      if (debouncedQuery) {
        query = query.ilike('name', `%${debouncedQuery}%`);
      }

      // Apply tab-specific filters
      if (activeTab === 'for_you') {
        // Only products from followed brands
        if (followedBrandIdsSet.size > 0) {
          query = query.in('brand_id', Array.from(followedBrandIdsSet));
        } else {
          // No followed brands, return empty
          setProducts([]);
          return;
        }
        query = query.order('created_at', { ascending: false }).limit(50);
      } else {
        // Most liked
        query = query.order('like_count', { ascending: false }).limit(50);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get user's liked products
      const { data: likedData } = await supabase
        .from('user_likes_products')
        .select('product_id')
        .eq('user_id', user!.id);

      const likedProductIds = new Set(likedData?.map((lp) => lp.product_id) || []);

      const productsWithLiked = (data || []).map((product: any) => ({
        ...product,
        is_liked: likedProductIds.has(product.id),
      }));

      setProducts(productsWithLiked);
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchBrands = async () => {
    try {
      let query = supabase
        .from('brands')
        .select(
          `
          *,
          products (
            *,
            brand:brands(id, name, slug, logo_url)
          )
        `
        );

      // Apply search filter
      if (debouncedQuery) {
        query = query.ilike('name', `%${debouncedQuery}%`);
      }

      query = query.order('follower_count', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // Get user's liked products
      const { data: likedData } = await supabase
        .from('user_likes_products')
        .select('product_id')
        .eq('user_id', user!.id);

      const likedProductIds = new Set(likedData?.map((lp) => lp.product_id) || []);

      // Process brands and their products
      const brandsWithProducts = (data || []).map((brand: any) => {
        const sortedProducts = (brand.products || [])
          .filter((p: any) => p.is_available)
          .sort((a: any, b: any) => (b.like_count || 0) - (a.like_count || 0))
          .slice(0, 6)
          .map((product: any) => ({
            ...product,
            is_liked: likedProductIds.has(product.id),
          }));

        return {
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          logo_url: brand.logo_url,
          follower_count: brand.follower_count,
          products: sortedProducts,
        };
      });

      setBrands(brandsWithProducts);
    } catch (err) {
      console.error('Error fetching brands:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      let query = supabase.from('profiles').select('id, display_name, username, avatar_url');

      // Apply search filter
      if (debouncedQuery) {
        query = query.or(
          `display_name.ilike.%${debouncedQuery}%,username.ilike.%${debouncedQuery}%`
        );
      }

      query = query.neq('id', user!.id).limit(50);

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

    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const wasLiked = product.is_liked;

    // Optimistic update
    setProducts((prev) =>
      prev.map((p) =>
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
      setProducts((prev) =>
        prev.map((p) =>
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

  const renderProductsList = () => (
    <FlatList
      key="products-grid"
      data={products}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.productRow}
      contentContainerStyle={styles.productListContent}
      showsVerticalScrollIndicator={false}
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
      renderItem={({ item }) => (
        <View style={styles.productCardWrapper}>
          <ProductCard
            product={item}
            onPress={() => handleProductPress(item.id)}
            onLike={() => handleToggleLikeProduct(item.id)}
            onBrandPress={() => handleBrandPress(item.brand.slug)}
          />
        </View>
      )}
    />
  );

  const renderBrandsList = () => (
    <FlatList
      key="brands-list"
      data={brands}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.brandListContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {debouncedQuery ? "We couldn't find any brands" : 'No brands available'}
          </Text>
          {debouncedQuery && (
            <Text style={styles.emptySubtext}>
              Try searching for something else or browse all brands in the Shop tab
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <BrandRowCard
          brandName={item.name}
          brandSlug={item.slug}
          isFollowing={followedBrandIds.has(item.id)}
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
      key="users-list"
      data={users}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.userListContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {debouncedQuery ? "We couldn't find any users" : 'No users available'}
          </Text>
          {debouncedQuery && (
            <Text style={styles.emptySubtext}>
              Try searching for a different name or username
            </Text>
          )}
        </View>
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
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
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
