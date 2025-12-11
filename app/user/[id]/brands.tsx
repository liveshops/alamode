import { BrandRowCard } from '@/components/BrandRowCard';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
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

export default function UserBrandsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [userName, setUserName] = useState('');
  const [brands, setBrands] = useState<BrandWithProducts[]>([]);
  const [followedBrandIds, setFollowedBrandIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const scrollPositionRef = useRef(0);
  const shouldRestoreScroll = useRef(false);

  useFocusEffect(
    useCallback(() => {
      shouldRestoreScroll.current = scrollPositionRef.current > 0;
      fetchUserBrands();
    }, [id, user])
  );

  const fetchUserBrands = async () => {
    if (!id || !user) return;

    try {
      setLoading(true);

      // Fetch user's display name
      const { data: userData } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', id)
        .single();

      if (userData) {
        setUserName(userData.display_name);
      }

      // Fetch brands this user follows with their products
      const { data: followedBrands, error: brandsError } = await supabase
        .from('user_follows_brands')
        .select(
          `
          brand_id,
          brands (
            id,
            name,
            slug,
            logo_url,
            follower_count
          )
        `
        )
        .eq('user_id', id);

      if (brandsError) throw brandsError;

      const brandIds = followedBrands?.map((f: any) => f.brand_id) || [];

      // Fetch products for each brand
      const brandsWithProducts: BrandWithProducts[] = [];
      for (const item of followedBrands || []) {
        const brand = Array.isArray(item.brands) ? item.brands[0] : item.brands;
        if (!brand) continue;

        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('brand_id', brand.id)
          .order('like_count', { ascending: false })
          .limit(10);

        // Check which products the current user has liked
        let productsWithLikes = productsData || [];
        if (user) {
          const productIds = productsData?.map((p) => p.id) || [];
          const { data: likedProducts } = await supabase
            .from('user_likes_products')
            .select('product_id')
            .eq('user_id', user.id)
            .in('product_id', productIds);

          const likedProductIds = new Set(likedProducts?.map((l) => l.product_id) || []);
          productsWithLikes = (productsData || []).map((product) => ({
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

      setBrands(brandsWithProducts);

      // Fetch current user's followed brands
      if (user) {
        const { data: myFollowedBrands } = await supabase
          .from('user_follows_brands')
          .select('brand_id')
          .eq('user_id', user.id);

        const followedIds = new Set(myFollowedBrands?.map((f) => f.brand_id) || []);
        setFollowedBrandIds(followedIds);
      }
    } catch (err) {
      console.error('Error fetching user brands:', err);
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
    await fetchUserBrands();
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

  const handleBrandPress = (slug: string) => {
    router.push(`/brand/${slug}`);
  };

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const handleToggleLike = async (productId: string) => {
    if (!user) return;

    // Find the product across all brands
    let targetBrand: BrandWithProducts | undefined;
    let targetProduct: Product | undefined;

    for (const brand of brands) {
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
    setBrands((prev) =>
      prev.map((brand) =>
        brand.id === targetBrand.id
          ? {
              ...brand,
              products: brand.products.map((p) =>
                p.id === productId
                  ? {
                      ...p,
                      is_liked: !wasLiked,
                      like_count: wasLiked
                        ? Math.max(0, p.like_count - 1)
                        : p.like_count + 1,
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
      setBrands((prev) =>
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

  if (loading && brands.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000" />
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
        <Text style={styles.headerTitle}>
          {userName ? `${userName}'s Brands` : 'Favorite Brands'}
        </Text>
        <View style={styles.backButton} />
      </View>

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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {userName ? `${userName} isn't following any brands yet` : 'No brands found'}
            </Text>
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
    fontSize: 18,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});
