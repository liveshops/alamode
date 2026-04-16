import { AddToCollectionSheet } from '@/components/AddToCollectionSheet';
import { BrandRowCard } from '@/components/BrandRowCard';
import { CollectionRow } from '@/components/CollectionRow';
import { LinkableText } from '@/components/LinkableText';
import { ProductCard } from '@/components/ProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { useCollections } from '@/hooks/useCollections';
import { Product } from '@/hooks/useProducts';
import { requireAuth } from '@/utils/authGuard';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  liked_items_count: number;
}

interface BrandWithProducts {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  follower_count: number;
  products: Product[];
}

export default function UserProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [likedProducts, setLikedProducts] = useState<Product[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followedBrandsCount, setFollowedBrandsCount] = useState(0);
  const [followedBrands, setFollowedBrands] = useState<BrandWithProducts[]>([]);
  const [myFollowedBrandIds, setMyFollowedBrandIds] = useState<Set<string>>(new Set());
  const [brandsLoaded, setBrandsLoaded] = useState(false);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'liked' | 'collections' | 'brands'>('liked');
  const [collectionSheetVisible, setCollectionSheetVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const scrollPositionRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const loadedIdRef = useRef<string | null>(null);

  const { collections } = useCollections(id);

  useFocusEffect(
    useCallback(() => {
      // Only fetch if we haven't loaded data for this user yet
      const needsFetch = !hasLoadedRef.current || loadedIdRef.current !== id;
      
      if (needsFetch) {
        hasLoadedRef.current = true;
        loadedIdRef.current = id;
        fetchUserProfile();
      } else if (scrollPositionRef.current > 0) {
        // Returning from product view - just restore scroll position
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: scrollPositionRef.current,
            animated: false,
          });
        }, 50);
      }
    }, [id, user])
  );

  const fetchUserProfile = async () => {
    if (!id) return;

    try {
      setLoading(true);

      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (profileError) throw profileError;

      setUserProfile(profileData);

      // Check if current user is following this user
      if (user) {
        const { data: followData } = await supabase
          .from('user_follows_users')
          .select('follower_id')
          .eq('follower_id', user.id)
          .eq('following_id', id)
          .maybeSingle();

        setIsFollowing(!!followData);
      }

      // Fetch count of brands this user follows (lazy load details when tab selected)
      const { count: brandsCount } = await supabase
        .from('user_follows_brands')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', id);

      setFollowedBrandsCount(brandsCount || 0);

      // Fetch user's liked products
      const { data: likedData, error: likedError } = await supabase
        .from('user_likes_products')
        .select(
          `
          product_id,
          products (
            *,
            brand:brands(id, name, slug, logo_url)
          )
        `
        )
        .eq('user_id', id)
        .order('liked_at', { ascending: false });

      if (likedError) throw likedError;

      // Get current user's liked products to mark them
      let currentUserLikedIds = new Set<string>();
      if (user) {
        const { data: currentUserLikes } = await supabase
          .from('user_likes_products')
          .select('product_id')
          .eq('user_id', user.id);

        currentUserLikedIds = new Set(currentUserLikes?.map((lp) => lp.product_id) || []);
      }

      const products = (likedData || [])
        .map((item: any) => item.products)
        .filter(Boolean)
        .map((product: any) => ({
          ...product,
          is_liked: currentUserLikedIds.has(product.id),
        }));

      setLikedProducts(products);
    } catch (err) {
      console.error('Error fetching user profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setBrandsLoaded(false); // Reset so brands reload on next tab visit
    await fetchUserProfile();
    setRefreshing(false);
  };

  // Lazy load brands with products when Brands tab is selected
  const fetchBrandsWithProducts = async () => {
    if (!id || brandsLoaded || brandsLoading) return;

    try {
      setBrandsLoading(true);

      // Fetch brands this user follows
      const { data: followedBrandsData, error: brandsError } = await supabase
        .from('user_follows_brands')
        .select(`
          brand_id,
          brands (
            id,
            name,
            slug,
            logo_url,
            follower_count
          )
        `)
        .eq('user_id', id);

      if (brandsError) throw brandsError;

      // Fetch products for each brand
      const brandsWithProducts: BrandWithProducts[] = [];
      for (const item of followedBrandsData || []) {
        const brand = Array.isArray(item.brands) ? item.brands[0] : item.brands;
        if (!brand) continue;

        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('brand_id', brand.id)
          .eq('is_available', true)
          .order('created_at', { ascending: false })
          .limit(10);

        brandsWithProducts.push({
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          logo_url: brand.logo_url,
          follower_count: brand.follower_count,
          products: productsData || [],
        });
      }

      setFollowedBrands(brandsWithProducts);

      // Fetch current user's followed brands to show follow state
      if (user) {
        const { data: myFollowedBrands } = await supabase
          .from('user_follows_brands')
          .select('brand_id')
          .eq('user_id', user.id);

        setMyFollowedBrandIds(new Set(myFollowedBrands?.map((f) => f.brand_id) || []));
      }

      setBrandsLoaded(true);
    } catch (err) {
      console.error('Error fetching brands:', err);
    } finally {
      setBrandsLoading(false);
    }
  };

  // Handle tab selection - lazy load brands if needed
  const handleTabSelect = (tab: 'liked' | 'collections' | 'brands') => {
    setActiveTab(tab);
    if (tab === 'brands' && !brandsLoaded && !brandsLoading) {
      fetchBrandsWithProducts();
    }
  };

  const handleToggleFollow = async () => {
    if (!user || !userProfile) return;

    const wasFollowing = isFollowing;

    // Optimistic update
    setIsFollowing(!wasFollowing);
    setUserProfile((prev) =>
      prev
        ? {
            ...prev,
            follower_count: wasFollowing ? prev.follower_count - 1 : prev.follower_count + 1,
          }
        : prev
    );

    try {
      if (wasFollowing) {
        await supabase
          .from('user_follows_users')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userProfile.id);
      } else {
        const { error } = await supabase
          .from('user_follows_users')
          .upsert(
            { follower_id: user.id, following_id: userProfile.id },
            { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
          );

        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      // Revert on error
      setIsFollowing(wasFollowing);
      setUserProfile((prev) =>
        prev
          ? {
              ...prev,
              follower_count: wasFollowing ? prev.follower_count + 1 : prev.follower_count - 1,
            }
          : prev
      );
    }
  };

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const handleBrandPress = (brandSlug: string) => {
    router.push(`/brand/${brandSlug}`);
  };

  const handleToggleLike = async (productId: string) => {
    if (!requireAuth(user, 'like products')) return;

    const product = likedProducts.find((p) => p.id === productId);
    if (!product) return;

    const wasLiked = product.is_liked;

    // Optimistic update
    setLikedProducts((prev) =>
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
      setLikedProducts((prev) =>
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

  // Handler for toggling follow on a brand
  const handleToggleBrandFollow = async (brandId: string) => {
    if (!requireAuth(user, 'follow brands')) return;

    const wasFollowing = myFollowedBrandIds.has(brandId);

    // Optimistic update
    setMyFollowedBrandIds((prev) => {
      const newSet = new Set(prev);
      if (wasFollowing) {
        newSet.delete(brandId);
      } else {
        newSet.add(brandId);
      }
      return newSet;
    });

    // Update follower count optimistically
    setFollowedBrands((prev) =>
      prev.map((brand) =>
        brand.id === brandId
          ? {
              ...brand,
              follower_count: wasFollowing
                ? Math.max(0, brand.follower_count - 1)
                : brand.follower_count + 1,
            }
          : brand
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
        await supabase.from('user_follows_brands').upsert(
          { user_id: user.id, brand_id: brandId },
          { onConflict: 'user_id,brand_id', ignoreDuplicates: true }
        );
      }
    } catch (err) {
      console.error('Error toggling brand follow:', err);
      // Revert on error
      setMyFollowedBrandIds((prev) => {
        const newSet = new Set(prev);
        if (wasFollowing) {
          newSet.add(brandId);
        } else {
          newSet.delete(brandId);
        }
        return newSet;
      });
      setFollowedBrands((prev) =>
        prev.map((brand) =>
          brand.id === brandId
            ? {
                ...brand,
                follower_count: wasFollowing
                  ? brand.follower_count + 1
                  : Math.max(0, brand.follower_count - 1),
              }
            : brand
        )
      );
    }
  };

  // Handler for toggling like on products within brand rows
  const handleBrandProductLike = async (productId: string) => {
    if (!requireAuth(user, 'like products')) return;

    // Find the product across all brands
    let targetBrand: BrandWithProducts | undefined;
    let targetProduct: Product | undefined;

    for (const brand of followedBrands) {
      const product = brand.products.find((p) => p.id === productId);
      if (product) {
        targetBrand = brand;
        targetProduct = product;
        break;
      }
    }

    if (!targetBrand || !targetProduct) return;

    const wasLiked = targetProduct.is_liked;

    // Optimistic update
    setFollowedBrands((prev) =>
      prev.map((brand) =>
        brand.id === targetBrand!.id
          ? {
              ...brand,
              products: brand.products.map((p) =>
                p.id === productId
                  ? {
                      ...p,
                      is_liked: !wasLiked,
                      like_count: wasLiked ? Math.max(0, p.like_count - 1) : p.like_count + 1,
                    }
                  : p
              ),
            }
          : brand
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
        await supabase.from('user_likes_products').upsert(
          { user_id: user.id, product_id: productId },
          { onConflict: 'user_id,product_id', ignoreDuplicates: true }
        );
      }
    } catch (err) {
      console.error('Error toggling like:', err);
      // Revert on error
      setFollowedBrands((prev) =>
        prev.map((brand) =>
          brand.id === targetBrand!.id
            ? {
                ...brand,
                products: brand.products.map((p) =>
                  p.id === productId
                    ? {
                        ...p,
                        is_liked: wasLiked,
                        like_count: wasLiked ? p.like_count + 1 : Math.max(0, p.like_count - 1),
                      }
                    : p
                ),
              }
            : brand
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

  if (!userProfile) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>User not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Back Button */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/')} activeOpacity={0.7}>
          <Text style={styles.appName}>cherry</Text>
        </TouchableOpacity>
        <View style={styles.backButton} />
      </View>

      <FlatList
        ref={flatListRef}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          scrollPositionRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
        }
        ListHeaderComponent={
          <View style={styles.profileSection}>
            {/* Avatar */}
            {userProfile.avatar_url ? (
              <Image source={{ uri: userProfile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {userProfile.display_name[0]?.toUpperCase()}
                </Text>
              </View>
            )}

            {/* Display Name */}
            <Text style={styles.displayName}>{userProfile.display_name}</Text>

            {/* Username */}
            <Text style={styles.username}>@{userProfile.username}</Text>

            {/* Bio */}
            {userProfile.bio && <LinkableText text={userProfile.bio} style={styles.bio} />}

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => router.push(`/user/${id}/followers`)}
                activeOpacity={0.7}>
                <Text style={styles.statNumber}>{userProfile.follower_count}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => router.push(`/user/${id}/following`)}
                activeOpacity={0.7}>
                <Text style={styles.statNumber}>{userProfile.following_count}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </TouchableOpacity>
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

            {/* Category Tabs */}
            <View style={styles.categoryTabs}>
              <TouchableOpacity
                style={styles.categoryTab}
                onPress={() => handleTabSelect('liked')}
                activeOpacity={0.7}>
                <View style={[styles.categoryBadge, activeTab !== 'liked' && styles.categoryBadgeInactive]}>
                  <Ionicons name="heart" size={16} color={activeTab === 'liked' ? '#fff' : '#666'} />
                  <Text style={[styles.categoryBadgeText, activeTab !== 'liked' && styles.categoryBadgeTextInactive]}>{userProfile.liked_items_count}</Text>
                </View>
                <Text style={[styles.categoryTabText, activeTab === 'liked' && styles.categoryTabTextActive]}>Liked Products</Text>
              </TouchableOpacity>
              {collections.length > 0 && (
                <TouchableOpacity
                  style={styles.categoryTab}
                  onPress={() => handleTabSelect('collections')}
                  activeOpacity={0.7}>
                  <View style={[styles.categoryBadge, activeTab !== 'collections' && styles.categoryBadgeInactive]}>
                    <Ionicons name="folder" size={16} color={activeTab === 'collections' ? '#fff' : '#666'} />
                    <Text style={[styles.categoryBadgeText, activeTab !== 'collections' && styles.categoryBadgeTextInactive]}>{collections.length}</Text>
                  </View>
                  <Text style={[styles.categoryTabText, activeTab === 'collections' && styles.categoryTabTextActive]}>Collections</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.categoryTab}
                onPress={() => handleTabSelect('brands')}
                activeOpacity={0.7}>
                <View style={[styles.categoryBadge, activeTab !== 'brands' && styles.categoryBadgeInactive]}>
                  <Ionicons name="heart" size={16} color={activeTab === 'brands' ? '#fff' : '#666'} />
                  <Text style={[styles.categoryBadgeText, activeTab !== 'brands' && styles.categoryBadgeTextInactive]}>{followedBrandsCount}</Text>
                </View>
                <Text style={[styles.categoryTabText, activeTab === 'brands' && styles.categoryTabTextActive]}>Favorite Brands</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          activeTab === 'liked' ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="heart-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No liked products</Text>
              <Text style={styles.emptySubtext}>
                {userProfile.display_name} hasn't liked any products yet
              </Text>
            </View>
          ) : activeTab === 'collections' ? (
            <View style={styles.collectionsContainer}>
              {collections.map((collection) => (
                <CollectionRow key={collection.id} collection={collection} />
              ))}
            </View>
          ) : activeTab === 'brands' ? (
            brandsLoading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color="#000" />
              </View>
            ) : followedBrands.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="heart-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No favorite brands</Text>
                <Text style={styles.emptySubtext}>
                  {userProfile.display_name} isn't following any brands yet
                </Text>
              </View>
            ) : (
              <View style={styles.brandsContainer}>
                {followedBrands.map((brand) => (
                  <BrandRowCard
                    key={brand.id}
                    brandName={brand.name}
                    brandSlug={brand.slug}
                    isFollowing={myFollowedBrandIds.has(brand.id)}
                    followerCount={brand.follower_count}
                    products={brand.products}
                    onBrandPress={() => handleBrandPress(brand.slug)}
                    onToggleFollow={() => handleToggleBrandFollow(brand.id)}
                    onProductPress={handleProductPress}
                    onToggleLike={handleBrandProductLike}
                  />
                ))}
              </View>
            )
          ) : null
        }
        renderItem={({ item }) => 
          activeTab === 'liked' ? (
            <View style={styles.productCardWrapper}>
              <ProductCard
                product={item}
                onPress={() => handleProductPress(item.id)}
                onLike={() => handleToggleLike(item.id)}
                onBrandPress={() => handleBrandPress(item.brand.slug)}
                onLongPress={() => {
                  setSelectedProduct({ id: item.id, name: item.name });
                  setCollectionSheetVisible(true);
                }}
              />
            </View>
          ) : null
        }
        data={activeTab === 'liked' ? likedProducts : []}
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
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appName: {
    fontFamily: 'AbrilFatface-Regular',
    fontSize: 24,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '600',
    color: '#fff',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  bio: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 24,
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
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#ddd',
  },
  followButton: {
    paddingHorizontal: 48,
    paddingVertical: 12,
    backgroundColor: '#000',
    borderRadius: 0,
    marginBottom: 16,
  },
  followingButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#000',
  },
  followButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  followingButtonText: {
    color: '#000',
  },
  categoryTabs: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: 8,
    marginBottom: 12,
    gap: 12,
  },
  categoryTab: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  categoryBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  categoryTabTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  categoryBadgeInactive: {
    backgroundColor: '#f0f0f0',
  },
  categoryBadgeTextInactive: {
    color: '#666',
  },
  collectionsContainer: {
    paddingTop: 8,
  },
  brandsContainer: {
    paddingTop: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  likedCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  likedCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  productRow: {
    justifyContent: 'space-between',
  },
  productCardWrapper: {
    flex: 1,
    maxWidth: '48%',
    marginBottom: 4,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
});
