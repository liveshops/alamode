import { Collection } from '@/hooks/useCollections';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { memo } from 'react';
import {
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface CollectionRowProps {
  collection: Collection;
  onProductPress?: (productId: string) => void;
}

export const CollectionRow = memo(function CollectionRow({ collection, onProductPress }: CollectionRowProps) {
  const router = useRouter();
  const products = collection.preview_products || [];

  const handleCollectionPress = () => {
    router.push(`/collection/${collection.id}`);
  };

  const handleProductPress = (productId: string) => {
    if (onProductPress) {
      onProductPress(productId);
    } else {
      router.push(`/product/${productId}`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Collection Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={handleCollectionPress}
        activeOpacity={0.7}>
        <Text style={styles.collectionName}>{collection.name}</Text>
        <View style={styles.headerRight}>
          <Text style={styles.productCount}>{collection.product_count}</Text>
          <Ionicons name="chevron-forward" size={18} color="#666" />
        </View>
      </TouchableOpacity>

      {/* Products Horizontal Scroll */}
      {products.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productsContainer}>
          {products.map((product) => (
            <TouchableOpacity
              key={product.id}
              style={styles.productCard}
              onPress={() => handleProductPress(product.id)}
              activeOpacity={0.9}>
              <Image
                source={{ uri: product.image_url }}
                style={styles.productImage}
                resizeMode="cover"
              />
              <Text style={styles.productName} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={styles.brandName} numberOfLines={1}>
                {product.brand_name}
              </Text>
              <Text style={styles.price}>
                ${(product.sale_price || product.price).toFixed(2)}
              </Text>
            </TouchableOpacity>
          ))}
          
          {/* See All Card */}
          {collection.product_count > products.length && (
            <TouchableOpacity
              style={styles.seeAllCard}
              onPress={handleCollectionPress}
              activeOpacity={0.7}>
              <Ionicons name="arrow-forward" size={24} color="#000" />
              <Text style={styles.seeAllText}>See All</Text>
              <Text style={styles.seeAllCount}>
                {collection.product_count} items
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No products yet</Text>
        </View>
      )}
    </View>
  );
});

CollectionRow.displayName = 'CollectionRow';

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  collectionName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  productCount: {
    fontSize: 14,
    color: '#666',
  },
  productsContainer: {
    paddingHorizontal: 16,
    gap: 12,
  },
  productCard: {
    width: 140,
  },
  productImage: {
    width: 140,
    height: 180,
    backgroundColor: '#f5f5f5',
    marginBottom: 8,
  },
  productName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#000',
    marginBottom: 2,
  },
  brandName: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  price: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  seeAllCard: {
    width: 100,
    height: 180,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  seeAllCount: {
    fontSize: 12,
    color: '#666',
  },
  emptyContainer: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
  },
});
