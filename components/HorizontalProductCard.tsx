import { Product } from '@/hooks/useProducts';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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

interface HorizontalProductCardProps {
  product: Product;
  onPress: () => void;
  onLike?: () => void;
  onBrandPress?: () => void;
}

export function HorizontalProductCard({
  product,
  onPress,
  onLike,
  onBrandPress,
}: HorizontalProductCardProps) {
  const displayPrice = product.sale_price || product.price;
  const hasDiscount = !!product.sale_price;

  const handleBuy = (e: any) => {
    e.stopPropagation();
    if (product.product_url) {
      Linking.openURL(product.product_url);
    }
  };

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.9}>
      {/* Product Image */}
      <View style={styles.imageContainer}>
        <Image source={{ uri: product.image_url }} style={styles.image} contentFit="cover" />
        {product.created_at && getRecencyBadge(product.created_at) && (
          <View style={styles.recencyBadge}>
            <Text style={styles.recencyText}>{getRecencyBadge(product.created_at)}</Text>
          </View>
        )}
      </View>

      {/* Product Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.productName} numberOfLines={2}>
          {product.name.toUpperCase()}
        </Text>

        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onBrandPress?.();
          }}
          disabled={!onBrandPress}
          activeOpacity={0.7}>
          <Text style={styles.brandName}>{product.brand.name}</Text>
        </TouchableOpacity>

        <View style={styles.priceRow}>
          <Text style={styles.price}>${displayPrice.toFixed(2)}</Text>
          {hasDiscount && (
            <Text style={styles.originalPrice}>${product.price.toFixed(2)}</Text>
          )}
        </View>
      </View>

      {/* Right Actions */}
      <View style={styles.rightActions}>
        <TouchableOpacity
          style={styles.heartButton}
          onPress={(e) => {
            e.stopPropagation();
            onLike?.();
          }}
          activeOpacity={0.7}>
          <View style={[styles.heartBadge, product.is_liked && styles.heartBadgeLiked]}>
            <Ionicons 
              name={product.is_liked ? "heart" : "heart-outline"} 
              size={18} 
              color={product.is_liked ? "#fff" : "#000"} 
            />
            {product.like_count >= 1 && (
              <Text style={[styles.likeCount, product.is_liked && styles.likeCountLiked]}>
                {product.like_count}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.buyButton} onPress={handleBuy} activeOpacity={0.8}>
          <Text style={styles.buyButtonText}>Buy</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  imageContainer: {
    position: 'relative',
    width: 80,
    height: 120,
  },
  image: {
    width: 80,
    height: 120,
    backgroundColor: '#f5f5f5',
  },
  recencyBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    zIndex: 1,
  },
  recencyText: {
    fontFamily: 'AbrilFatface-Regular',
    fontSize: 12,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  infoContainer: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    lineHeight: 16,
    letterSpacing: 0.3,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '300',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
  },
  originalPrice: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  rightActions: {
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingLeft: 8,
  },
  heartButton: {
    padding: 4,
  },
  heartBadge: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  heartBadgeLiked: {
    backgroundColor: '#000',
  },
  likeCount: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
  likeCountLiked: {
    color: '#fff',
  },
  buyButton: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 0,
    backgroundColor: '#fff',
  },
  buyButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
