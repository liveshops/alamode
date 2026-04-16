import { AddToCollectionSheet } from '@/components/AddToCollectionSheet';
import { BrandRowCard } from '@/components/BrandRowCard';
import { CollectionRow } from '@/components/CollectionRow';
import { LinkableText } from '@/components/LinkableText';
import { ProductCard } from '@/components/ProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { useCollections } from '@/hooks/useCollections';
import { Product } from '@/hooks/useProducts';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
    ActionSheetIOS,
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
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

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut, deleteAccount } = useAuth();

  const [likedProducts, setLikedProducts] = useState<Product[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [likedItemsCount, setLikedItemsCount] = useState(0);
  const [followedBrandsCount, setFollowedBrandsCount] = useState(0);
  const [followedBrands, setFollowedBrands] = useState<BrandWithProducts[]>([]);
  const [brandsLoaded, setBrandsLoaded] = useState(false);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'liked' | 'collections' | 'brands'>('liked');
  const [collectionSheetVisible, setCollectionSheetVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const scrollPositionRef = useRef(0);
  const shouldRestoreScroll = useRef(false);
  const hasLoadedRef = useRef(false);

  const { collections, refetch: refetchCollections } = useCollections();

  useFocusEffect(
    useCallback(() => {
      // Only fetch if we haven't loaded data yet
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        fetchProfileData();
      } else if (scrollPositionRef.current > 0) {
        // Returning from product view - just restore scroll position
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: scrollPositionRef.current,
            animated: false,
          });
        }, 50);
      }
    }, [user])
  );

  const fetchProfileData = async () => {
    if (!user || !profile) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch updated profile stats
      const { data: profileData } = await supabase
        .from('profiles')
        .select('follower_count, following_count, liked_items_count')
        .eq('id', user.id)
        .single();

      if (profileData) {
        setFollowerCount(profileData.follower_count || 0);
        setFollowingCount(profileData.following_count || 0);
        setLikedItemsCount(profileData.liked_items_count || 0);
      }

      // Fetch count of brands user follows (just the count, not products - lazy load those)
      const { count: brandsCount } = await supabase
        .from('user_follows_brands')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setFollowedBrandsCount(brandsCount || 0);

      // Fetch liked products
      const { data: likedData, error } = await supabase
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
        .eq('user_id', user.id)
        .order('liked_at', { ascending: false });

      if (error) throw error;

      const products = (likedData || [])
        .map((item: any) => item.products)
        .filter(Boolean)
        .map((product: any) => ({
          ...product,
          is_liked: true, // All products here are liked by definition
        }));

      setLikedProducts(products);
    } catch (err) {
      console.error('Error fetching profile data:', err);
    } finally {
      setLoading(false);
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

  const onRefresh = async () => {
    setRefreshing(true);
    setBrandsLoaded(false); // Reset so brands reload on next tab visit
    await fetchProfileData();
    setRefreshing(false);
  };

  // Lazy load brands with products when Brands tab is selected
  const fetchBrandsWithProducts = async () => {
    if (!user || brandsLoaded || brandsLoading) return;

    try {
      setBrandsLoading(true);

      // Fetch brands user follows
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
        .eq('user_id', user.id);

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

        // Check which products the user has liked
        let productsWithLikes = productsData || [];
        if (productsData && productsData.length > 0) {
          const productIds = productsData.map((p) => p.id);
          const { data: likedProducts } = await supabase
            .from('user_likes_products')
            .select('product_id')
            .eq('user_id', user.id)
            .in('product_id', productIds);

          const likedProductIds = new Set(likedProducts?.map((l) => l.product_id) || []);
          productsWithLikes = productsData.map((product) => ({
            ...product,
            is_liked: likedProductIds.has(product.id),
          }));
        }

        brandsWithProducts.push({
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          logo_url: brand.logo_url,
          follower_count: brand.follower_count,
          products: productsWithLikes,
        });
      }

      setFollowedBrands(brandsWithProducts);
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

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const handleBrandPress = (brandSlug: string) => {
    router.push(`/brand/${brandSlug}`);
  };

  const handleToggleLike = async (productId: string) => {
    if (!user) return;

    const product = likedProducts.find((p) => p.id === productId);
    if (!product) return;

    // Optimistically remove from list (since we're unliking)
    setLikedProducts((prev) => prev.filter((p) => p.id !== productId));
    setLikedItemsCount((prev) => Math.max(0, prev - 1));

    try {
      await supabase
        .from('user_likes_products')
        .delete()
        .eq('user_id', user.id)
        .eq('product_id', productId);
    } catch (err) {
      console.error('Error unliking product:', err);
      // Revert on error
      setLikedProducts((prev) => [product, ...prev]);
      setLikedItemsCount((prev) => prev + 1);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This will remove all your data including liked products, collections, and followers. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await deleteAccount();
              if (error) {
                Alert.alert('Error', 'Failed to delete account. Please try again.');
              } else {
                router.replace('/(auth)/login');
              }
            } catch (err) {
              console.error('Error deleting account:', err);
              Alert.alert('Error', 'Failed to delete account. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleSettingsPress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Edit Profile', 'Log Out', 'Delete Account', 'Cancel'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 3,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) router.push('/edit-profile');
          else if (buttonIndex === 1) handleLogout();
          else if (buttonIndex === 2) handleDeleteAccount();
        }
      );
    } else {
      Alert.alert('Settings', undefined, [
        { text: 'Edit Profile', onPress: () => router.push('/edit-profile') },
        { text: 'Log Out', onPress: handleLogout },
        { text: 'Delete Account', style: 'destructive', onPress: handleDeleteAccount },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleLongPress = (product: Product) => {
    setSelectedProduct({ id: product.id, name: product.name });
    setCollectionSheetVisible(true);
  };

  const handleAddedToCollection = (collectionName: string) => {
    refetchCollections();
  };

  // Handler for toggling follow on a brand (from brands tab)
  const handleToggleFollow = async (brandId: string) => {
    if (!user) return;

    // Since we're viewing our own followed brands, unfollowing removes from list
    const brandToRemove = followedBrands.find(b => b.id === brandId);
    if (!brandToRemove) return;

    // Optimistically remove from list
    setFollowedBrands(prev => prev.filter(b => b.id !== brandId));
    setFollowedBrandsCount(prev => Math.max(0, prev - 1));

    try {
      await supabase
        .from('user_follows_brands')
        .delete()
        .eq('user_id', user.id)
        .eq('brand_id', brandId);
    } catch (err) {
      console.error('Error unfollowing brand:', err);
      // Revert on error
      setFollowedBrands(prev => [...prev, brandToRemove]);
      setFollowedBrandsCount(prev => prev + 1);
    }
  };

  // Handler for toggling like on products within brand rows
  const handleBrandProductLike = async (productId: string) => {
    if (!user) return;

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

  if (!user || !profile) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Text style={styles.appName}>cherry</Text>
        </View>
        <View style={styles.guestContainer}>
          <Ionicons name="person-outline" size={64} color="#ccc" />
          <Text style={styles.guestTitle}>Your Profile</Text>
          <Text style={styles.guestSubtext}>
            Sign in to manage your profile, collections, and more
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.7}>
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.signUpLink}
            onPress={() => router.push('/(auth)/signup')}
            activeOpacity={0.7}>
            <Text style={styles.signUpLinkText}>Don't have an account? Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const displayName = profile.display_name;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.replace('/')} activeOpacity={0.7}>
          <Text style={styles.appName}>cherry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={handleSettingsPress}
          activeOpacity={0.7}>
          <Ionicons name="settings-outline" size={22} color="#000" />
        </TouchableOpacity>
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
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{displayName[0]?.toUpperCase()}</Text>
              </View>
            )}

            {/* Display Name */}
            <Text style={styles.displayName}>{displayName}</Text>

            {/* Username */}
            <Text style={styles.username}>@{profile.username}</Text>

            {/* Bio */}
            {profile.bio && <LinkableText text={profile.bio} style={styles.bio} />}

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => router.push(`/user/${user?.id}/followers`)}
                activeOpacity={0.7}>
                <Text style={styles.statNumber}>{followerCount}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => router.push(`/user/${user?.id}/following`)}
                activeOpacity={0.7}>
                <Text style={styles.statNumber}>{followingCount}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </TouchableOpacity>
            </View>

            {/* Category Tabs */}
            <View style={styles.categoryTabs}>
              <TouchableOpacity
                style={styles.categoryTab}
                onPress={() => handleTabSelect('liked')}
                activeOpacity={0.7}>
                <View style={[styles.categoryBadge, activeTab !== 'liked' && styles.categoryBadgeInactive]}>
                  <Ionicons name="heart" size={16} color={activeTab === 'liked' ? '#fff' : '#666'} />
                  <Text style={[styles.categoryBadgeText, activeTab !== 'liked' && styles.categoryBadgeTextInactive]}>{likedItemsCount}</Text>
                </View>
                <Text style={[styles.categoryTabText, activeTab === 'liked' && styles.categoryTabTextActive]}>Liked Products</Text>
              </TouchableOpacity>
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
              <Text style={styles.emptyText}>No liked products yet</Text>
              <Text style={styles.emptySubtext}>
                Products you heart will appear here
              </Text>
            </View>
          ) : activeTab === 'collections' ? (
            collections.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No collections yet</Text>
                <Text style={styles.emptySubtext}>
                  Long press on any product to create your first collection
                </Text>
              </View>
            ) : (
              <View style={styles.collectionsContainer}>
                {collections.map((collection) => (
                  <CollectionRow key={collection.id} collection={collection} />
                ))}
              </View>
            )
          ) : activeTab === 'brands' ? (
            brandsLoading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color="#000" />
              </View>
            ) : followedBrands.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="heart-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No favorite brands yet</Text>
                <Text style={styles.emptySubtext}>
                  Brands you follow will appear here
                </Text>
              </View>
            ) : (
              <View style={styles.brandsContainer}>
                {followedBrands.map((brand) => (
                  <BrandRowCard
                    key={brand.id}
                    brandName={brand.name}
                    brandSlug={brand.slug}
                    isFollowing={true}
                    followerCount={brand.follower_count}
                    products={brand.products}
                    onBrandPress={() => handleBrandPress(brand.slug)}
                    onToggleFollow={() => handleToggleFollow(brand.id)}
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
                onLongPress={() => handleLongPress(item)}
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
          onAdded={handleAddedToCollection}
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
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  settingsButton: {
    position: 'absolute',
    right: 16,
    bottom: 10,
    padding: 4,
  },
  appName: {
    fontFamily: 'AbrilFatface-Regular',
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: 2,
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
    lineHeight: 20,
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
  categoryTabs: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: 12,
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
  collectionsContainer: {
    paddingTop: 0,
  },
  brandsContainer: {
    paddingTop: 0,
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
    marginBottom: 16,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 1,
  },
  signUpLink: {
    paddingVertical: 8,
  },
  signUpLinkText: {
    fontSize: 14,
    color: '#666',
  },
});
