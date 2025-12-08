import { ProductCard } from '@/components/ProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut } = useAuth();

  const [likedProducts, setLikedProducts] = useState<Product[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [likedItemsCount, setLikedItemsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchProfileData();
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
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfileData();
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

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Profile not found</Text>
      </View>
    );
  }

  const displayName = profile.display_name;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.appName}>a la Mode</Text>
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
            {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{followerCount}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{followingCount}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </View>
            </View>

            {/* Edit Profile Button */}
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => router.push('/edit-profile')}
              activeOpacity={0.7}>
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </TouchableOpacity>

            {/* Logout Button */}
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.7}>
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </TouchableOpacity>

            {/* Liked Products Header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Liked Products</Text>
              <View style={styles.likedCountBadge}>
                <Ionicons name="heart" size={16} color="#fff" />
                <Text style={styles.likedCountText}>{likedItemsCount}</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="heart-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No liked products yet</Text>
            <Text style={styles.emptySubtext}>
              Products you heart will appear here
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  appName: {
    fontFamily: 'Zodiak-Thin',
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
  editButton: {
    paddingHorizontal: 48,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 0,
    marginBottom: 12,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  logoutButton: {
    paddingHorizontal: 48,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 0,
    marginBottom: 32,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '500',
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
