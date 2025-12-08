import { BrandRowCard } from '@/components/BrandRowCard';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { supabase } from '@/utils/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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

  useFocusEffect(
    useCallback(() => {
      fetchBrands();
    }, [user])
  );

  const fetchBrands = async () => {
    try {
      setLoading(true);

      // Fetch all brands with their top products
      const { data: brandsData, error: brandsError } = await supabase
        .from('brands')
        .select(
          `
          *,
          products (
            *,
            brand:brands(id, name, slug, logo_url)
          )
        `
        )
        .order('follower_count', { ascending: false });

      if (brandsError) throw brandsError;

      // Get user's liked products
      let likedProductIds = new Set<string>();
      if (user) {
        const { data: likedData } = await supabase
          .from('user_likes_products')
          .select('product_id')
          .eq('user_id', user.id);

        likedProductIds = new Set(likedData?.map((lp) => lp.product_id) || []);
      }

      // Process brands and their products
      const brandsWithProducts = (brandsData || []).map((brand: any) => {
        // Sort products by like count and take top 6
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

      // Fetch user's followed brands
      if (user) {
        const { data: followedData, error: followError } = await supabase
          .from('user_follows_brands')
          .select('brand_id')
          .eq('user_id', user.id);

        if (followError) throw followError;

        const followedIds = new Set(followedData?.map((f) => f.brand_id) || []);
        setFollowedBrandIds(followedIds);
      } else {
        setFollowedBrandIds(new Set());
      }
    } catch (err) {
      console.error('Error fetching brands:', err);
    } finally {
      setLoading(false);
    }
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
        <Text style={styles.appName}>a la Mode</Text>
      </View>

      {/* Brands List */}
      <FlatList
        data={brands}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
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
    fontFamily: 'Zodiak-Thin',
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
});
