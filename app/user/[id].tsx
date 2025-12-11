import { ProductCard } from '@/components/ProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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

export default function UserProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [likedProducts, setLikedProducts] = useState<Product[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followedBrandsCount, setFollowedBrandsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchUserProfile();
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

      // Fetch count of brands user follows
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
    await fetchUserProfile();
    setRefreshing(false);
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
    if (!user) return;

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
        <Text style={styles.appName}>a la Mode</Text>
        <View style={styles.backButton} />
      </View>

      <FlatList
        data={likedProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
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
            {userProfile.bio && <Text style={styles.bio}>{userProfile.bio}</Text>}

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{userProfile.follower_count}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
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
              <View style={styles.categoryTab}>
                <View style={styles.categoryBadge}>
                  <Ionicons name="heart" size={16} color="#fff" />
                  <Text style={styles.categoryBadgeText}>{userProfile.liked_items_count}</Text>
                </View>
                <Text style={styles.categoryTabText}>Liked Products</Text>
              </View>
              <TouchableOpacity
                style={styles.categoryTab}
                onPress={() => router.push(`/user/${id}/brands`)}
                activeOpacity={0.7}>
                <View style={styles.categoryBadge}>
                  <Ionicons name="heart" size={16} color="#fff" />
                  <Text style={styles.categoryBadgeText}>{followedBrandsCount}</Text>
                </View>
                <Text style={styles.categoryTabText}>Favorite Brands</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="heart-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No liked products</Text>
            <Text style={styles.emptySubtext}>
              {userProfile.display_name} hasn't liked any products yet
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.productCardWrapper}>
            <ProductCard
              product={item}
              onPress={() => handleProductPress(item.id)}
              onLike={() => handleToggleLike(item.id)}
              onBrandPress={() => handleBrandPress(item.brand.slug)}
            />
          </View>
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
    fontSize: 24,
    fontWeight: '300',
    fontStyle: 'italic',
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
    marginBottom: 32,
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
    marginTop: 24,
    marginBottom: 24,
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
    color: '#000',
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
    marginBottom: 24,
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
