import { BrandCard } from '@/components/BrandCard';
import { HorizontalProductCard } from '@/components/HorizontalProductCard';
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
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  follower_count: number;
}

type TabType = 'products' | 'brands';

export default function FavoritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [user])
  );

  const fetchData = async () => {
    if (!user) {
      setProducts([]);
      setBrands([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch liked products
      const { data: likedProductsData, error: productsError } = await supabase
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

      if (productsError) throw productsError;

      const productsWithLiked = (likedProductsData || [])
        .map((item: any) => item.products)
        .filter(Boolean)
        .map((product: any) => ({
          ...product,
          is_liked: true,
        }));

      setProducts(productsWithLiked);

      // Fetch followed brands
      const { data: followedBrandsData, error: brandsError } = await supabase
        .from('user_follows_brands')
        .select(
          `
          brand_id,
          brands (*)
        `
        )
        .eq('user_id', user.id)
        .order('followed_at', { ascending: false });

      if (brandsError) throw brandsError;

      const followedBrands = (followedBrandsData || [])
        .map((item: any) => item.brands)
        .filter(Boolean);

      setBrands(followedBrands);
    } catch (err) {
      console.error('Error fetching favorites:', err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleToggleLike = async (productId: string) => {
    if (!user) return;

    const product = products.find((p) => p.id === productId);
    if (!product) return;

    // Optimistically remove from list
    setProducts((prev) => prev.filter((p) => p.id !== productId));

    try {
      await supabase
        .from('user_likes_products')
        .delete()
        .eq('user_id', user.id)
        .eq('product_id', productId);
    } catch (err) {
      console.error('Error unliking product:', err);
      // Revert on error
      setProducts((prev) => [product, ...prev]);
    }
  };

  const handleToggleFollowBrand = async (brandId: string) => {
    if (!user) return;

    const brand = brands.find((b) => b.id === brandId);
    if (!brand) return;

    // Optimistically remove from list
    setBrands((prev) => prev.filter((b) => b.id !== brandId));

    try {
      await supabase
        .from('user_follows_brands')
        .delete()
        .eq('user_id', user.id)
        .eq('brand_id', brandId);
    } catch (err) {
      console.error('Error unfollowing brand:', err);
      // Revert on error
      setBrands((prev) => [brand, ...prev]);
    }
  };

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const handleBrandPress = (brandSlug: string) => {
    router.push(`/brand/${brandSlug}`);
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  const renderProductsList = () => (
    <FlatList
      data={products}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No liked products yet</Text>
          <Text style={styles.emptySubtext}>
            Products you heart will appear here
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <HorizontalProductCard
          product={item}
          onPress={() => handleProductPress(item.id)}
          onLike={() => handleToggleLike(item.id)}
          onBrandPress={() => handleBrandPress(item.brand.slug)}
        />
      )}
    />
  );

  const renderBrandsList = () => (
    <FlatList
      data={brands}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.brandsListContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No followed brands yet</Text>
          <Text style={styles.emptySubtext}>
            Brands you follow will appear here
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <BrandCard
          brand={item}
          isFollowing={true}
          onPress={() => handleBrandPress(item.slug)}
          onToggleFollow={() => handleToggleFollowBrand(item.id)}
        />
      )}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.appName}>a la Mode</Text>
      </View>

      {/* Segmented Control */}
      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[styles.segment, activeTab === 'products' && styles.segmentActive]}
          onPress={() => setActiveTab('products')}
          activeOpacity={0.7}>
          <Text style={[styles.segmentText, activeTab === 'products' && styles.segmentTextActive]}>
            Products
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, activeTab === 'brands' && styles.segmentActive]}
          onPress={() => setActiveTab('brands')}
          activeOpacity={0.7}>
          <Text style={[styles.segmentText, activeTab === 'brands' && styles.segmentTextActive]}>
            Brands
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'products' ? renderProductsList() : renderBrandsList()}
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
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 0,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#fff',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  segmentTextActive: {
    color: '#000',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  brandsListContent: {
    paddingTop: 8,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
  },
});
