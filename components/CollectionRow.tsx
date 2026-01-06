import { Collection } from '@/hooks/useCollections';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { memo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

/**
 * Get recency badge text based on product created_at date
 */
function getRecencyBadge(createdAt: string | undefined): string | null {
  if (!createdAt) return null;
  
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffHours < 24) return `${Math.max(1, diffHours)}hr`;
  if (diffDays < 7) return `${diffDays}d`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w`;
  
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 4) return `${diffMonths}m`;
  
  return null;
}

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
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: product.image_url }}
                  style={styles.productImage}
                  contentFit="cover"
                />
                {/* Likes count badge */}
                {product.like_count !== undefined && product.like_count > 0 && (
                  <View style={styles.likesBadge}>
                    <Ionicons name="heart" size={10} color="#fff" />
                    <Text style={styles.likesText}>{product.like_count}</Text>
                  </View>
                )}
                {/* Recency badge */}
                {product.created_at && getRecencyBadge(product.created_at) && (
                  <View style={styles.recencyBadge}>
                    <Text style={styles.recencyText}>{getRecencyBadge(product.created_at)}</Text>
                  </View>
                )}
              </View>
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
  imageContainer: {
    position: 'relative',
    width: 140,
    height: 180,
    marginBottom: 8,
  },
  productImage: {
    width: 140,
    height: 180,
    backgroundColor: '#f5f5f5',
  },
  likesBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  likesText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  recencyBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    zIndex: 1,
  },
  recencyText: {
    fontFamily: 'AbrilFatface-Regular',
    fontSize: 14,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
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
