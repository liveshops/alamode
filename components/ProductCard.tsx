import { Product } from '@/hooks/useProducts';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { memo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onLike: () => void;
  onBrandPress?: () => void;
  onLongPress?: () => void;
}

export const ProductCard = memo(function ProductCard({ product, onPress, onLike, onBrandPress, onLongPress }: ProductCardProps) {
  const [imageWidth, setImageWidth] = useState(0);
  
  // Combine main image with additional images
  const allImages = [product.image_url, ...(product.additional_images || [])].filter(Boolean);
  const hasMultipleImages = allImages.length > 1;
  
  const handleLayout = (event: any) => {
    const { width } = event.nativeEvent.layout;
    setImageWidth(width);
  };
  
  // Determine which price is lower (the actual sale/current price)
  const hasDiscount = product.sale_price != null && product.sale_price !== product.price;
  
  // Always show the lower price as current, higher as original (struck through)
  let currentPrice = product.price;
  let originalPrice = product.price; // default, will be overwritten if hasDiscount
  
  if (hasDiscount && product.sale_price != null) {
    // Ensure currentPrice is the lower one, originalPrice is the higher one
    if (product.sale_price < product.price) {
      currentPrice = product.sale_price;
      originalPrice = product.price;
    } else {
      currentPrice = product.price;
      originalPrice = product.sale_price;
    }
  }

  return (
    <View style={styles.container}>
      {/* Product Image Carousel */}
      <View style={styles.imageContainer} onLayout={handleLayout}>
        {hasMultipleImages && imageWidth > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={true}
            alwaysBounceHorizontal={true}
            nestedScrollEnabled={true}
            style={styles.imageScrollView}>
            {allImages.map((imageUrl, index) => (
              <Pressable
                key={index}
                onPress={onPress}
                onLongPress={() => {
                  if (onLongPress) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onLongPress();
                  }
                }}
                delayLongPress={400}>
                <Image
                  source={{ uri: imageUrl }}
                  style={[styles.image, { width: imageWidth }]}
                  resizeMode="cover"
                />
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Pressable
            onPress={onPress}
            onLongPress={() => {
              if (onLongPress) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onLongPress();
              }
            }}
            delayLongPress={400}>
            <Image source={{ uri: product.image_url }} style={styles.image} resizeMode="cover" />
          </Pressable>
        )}

        {/* Heart Icon */}
        <TouchableOpacity
          style={styles.heartButton}
          onPress={(e) => {
            e.stopPropagation();
            onLike();
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
      </View>

      {/* Product Info */}
      <TouchableOpacity style={styles.infoContainer} onPress={onPress} activeOpacity={0.7}>
        <Text style={styles.productName} numberOfLines={2}>
          {product.name}
        </Text>

        {/* Brand Name */}
        <TouchableOpacity 
          onPress={(e) => {
            e.stopPropagation();
            onBrandPress?.();
          }}
          disabled={!onBrandPress}
          activeOpacity={0.7}>
          <Text style={styles.brandName} numberOfLines={1}>{product.brand.name}</Text>
        </TouchableOpacity>

        {/* Price Row */}
        <View style={styles.priceContainer}>
          {hasDiscount && (
            <Text style={styles.originalPrice}>${originalPrice.toFixed(2)}</Text>
          )}
          <Text style={styles.currentPrice}>${currentPrice.toFixed(2)}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginBottom: 8,
  },
  imageContainer: {
    position: 'relative',
    aspectRatio: 3 / 4,
    backgroundColor: '#f5f5f5',
    borderRadius: 0,
    overflow: 'hidden',
  },
  imageScrollView: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  heartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
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
  infoContainer: {
    paddingTop: 8,
  },
  productName: {
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 4,
    lineHeight: 18,
  },
  brandName: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  originalPrice: {
    fontSize: 12,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  currentPrice: {
    fontSize: 14,
    fontWeight: '600',
  },
});

ProductCard.displayName = 'ProductCard';
