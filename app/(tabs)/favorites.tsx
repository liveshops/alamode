import { BrandCard } from '@/components/BrandCard';
import { HorizontalProductCard } from '@/components/HorizontalProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { supabase } from '@/utils/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
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
  const productsListRef = useRef<FlatList>(null);
  const brandsListRef = useRef<FlatList>(null);
  const productsScrollRef = useRef(0);
  const brandsScrollRef = useRef(0);
  const shouldRestoreProductsScroll = useRef(false);
  const shouldRestoreBrandsScroll = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'products') {
        shouldRestoreProductsScroll.current = productsScrollRef.current > 0;
      } else {
        shouldRestoreBrandsScroll.current = brandsScrollRef.current > 0;
      }
      fetchData();
    }, [user, activeTab])
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

      // Use optimized database function for liked products
      const { data: likedProductsData, error: productsError } = await supabase
        .rpc('get_user_liked_products', {
          p_user_id: user.id,
          p_limit: 100,
          p_offset: 0
        });

      if (productsError) throw productsError;

      const productsWithLiked = (likedProductsData || []).map((product: any) => ({
        ...product,
        brand: {
          id: product.brand_id,
          name: product.brand_name,
          slug: product.brand_slug,
          logo_url: product.brand_logo_url,
        },
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
      // Restore scroll after data loads
      setTimeout(() => {
        if (shouldRestoreProductsScroll.current) {
          productsListRef.current?.scrollToOffset({
            offset: productsScrollRef.current,
            animated: false,
          });
          shouldRestoreProductsScroll.current = false;
        }
        if (shouldRestoreBrandsScroll.current) {
          brandsListRef.current?.scrollToOffset({
            offset: brandsScrollRef.current,
            animated: false,
          });
          shouldRestoreBrandsScroll.current = false;
        }
      }, 300);
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
      ref={productsListRef}
      data={products}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => {
        productsScrollRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
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
      ref={brandsListRef}
      data={brands}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.brandsListContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => {
        brandsScrollRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
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
        <Text style={styles.appName}>cherry</Text>
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
    fontFamily: 'AbrilFatface-Regular',
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
