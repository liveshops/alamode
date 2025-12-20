import { ProductCard } from '@/components/ProductCard';
import { useAuth } from '@/contexts/AuthContext';
import { useCollectionProducts } from '@/hooks/useCollections';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CollectionInfo {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  product_count: number;
  is_public: boolean;
}

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { products, loading, error, refetch, toggleLike } = useCollectionProducts(id);
  const [collectionInfo, setCollectionInfo] = useState<CollectionInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const isOwner = collectionInfo?.user_id === user?.id;

  useEffect(() => {
    fetchCollectionInfo();
  }, [id]);

  const fetchCollectionInfo = async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from('collections')
      .select('id, name, description, user_id, product_count, is_public')
      .eq('id', id)
      .single();

    if (data) {
      setCollectionInfo(data);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchCollectionInfo(), refetch()]);
    setRefreshing(false);
  };

  const handleDeleteCollection = () => {
    Alert.alert(
      'Delete Collection',
      `Are you sure you want to delete "${collectionInfo?.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('delete_collection', {
              p_user_id: user?.id,
              p_collection_id: id,
            });
            if (!error) {
              router.back();
            }
          },
        },
      ]
    );
  };

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (error || !collectionInfo) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Collection not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {collectionInfo.name}
        </Text>
        {isOwner && (
          <TouchableOpacity
            style={styles.menuButton}
            onPress={handleDeleteCollection}
            activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={22} color="#000" />
          </TouchableOpacity>
        )}
      </View>

      {/* Product Count */}
      <View style={styles.countContainer}>
        <Text style={styles.countText}>
          {collectionInfo.product_count} {collectionInfo.product_count === 1 ? 'item' : 'items'}
        </Text>
      </View>

      {/* Products Grid */}
      <FlatList
        data={products}
        keyExtractor={(item) => item.product_id}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No products in this collection</Text>
            {isOwner && (
              <Text style={styles.emptySubtext}>
                Long press on any product to add it here
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.productCardWrapper}>
            <ProductCard
              product={{
                id: item.product_id,
                brand_id: item.brand_id,
                external_id: '',
                name: item.name,
                description: null,
                price: item.price,
                sale_price: item.sale_price,
                currency: 'USD',
                image_url: item.image_url,
                additional_images: item.additional_images,
                product_url: '',
                like_count: item.like_count,
                is_available: true,
                created_at: item.added_at,
                brand: {
                  id: item.brand_id,
                  name: item.brand_name,
                  slug: item.brand_slug,
                  logo_url: null,
                },
                is_liked: item.is_liked,
              }}
              onPress={() => handleProductPress(item.product_id)}
              onLike={() => toggleLike(item.product_id)}
              onBrandPress={() => router.push(`/brand/${item.brand_slug}`)}
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
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginRight: 44,
  },
  menuButton: {
    padding: 8,
    position: 'absolute',
    right: 8,
  },
  countContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  countText: {
    fontSize: 14,
    color: '#666',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
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
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  backLink: {
    fontSize: 14,
    color: '#007AFF',
  },
});
