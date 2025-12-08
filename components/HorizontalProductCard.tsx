import { Product } from '@/hooks/useProducts';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface HorizontalProductCardProps {
  product: Product;
  onPress: () => void;
  onLike: () => void;
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
      <Image source={{ uri: product.image_url }} style={styles.image} resizeMode="cover" />

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
            onLike();
          }}
          activeOpacity={0.7}>
          <Ionicons name="heart" size={24} color="#000" />
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
  image: {
    width: 80,
    height: 120,
    backgroundColor: '#f5f5f5',
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
