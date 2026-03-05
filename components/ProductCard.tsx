import { Product } from '@/hooks/useProducts';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * Get recency badge text based on product created_at date
 * Returns hours for <24h, then days (1d-6d), weeks (1w-4w), months (1m+)
 */
function getRecencyBadge(createdAt: string | undefined): string | null {
  if (!createdAt) return null;
  
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  // Less than 24 hours - show hours
  if (diffHours < 24) return `${Math.max(1, diffHours)}hr`;
  
  // 1-6 days
  if (diffDays < 7) return `${diffDays}d`;
  
  // 1-4 weeks
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w`;
  
  // 1-3 months
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 4) return `${diffMonths}mo`;
  
  // Older than 3 months - don't show badge
  return null;
}

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onLike: () => void;
  onBrandPress?: () => void;
  onLongPress?: () => void;
}

export const ProductCard = memo(function ProductCard({ product, onPress, onLike, onBrandPress, onLongPress }: ProductCardProps) {
  const [imageWidth, setImageWidth] = useState(0);
  
  // Memoize expensive calculations
  const allImages = useMemo(() => 
    [product.image_url, ...(product.additional_images || [])]
      .filter(Boolean)
      .map(url => getOptimizedImageUrl(url)),
    [product.image_url, product.additional_images]
  );
  
  const hasMultipleImages = allImages.length > 1;
  
  const handleLayout = (event: any) => {
    const { width } = event.nativeEvent.layout;
    setImageWidth(width);
  };
  
  // Memoize price calculations
  const { currentPrice, originalPrice, hasDiscount } = useMemo(() => {
    const hasDiscount = product.sale_price != null && product.sale_price !== product.price;
    let currentPrice = product.price;
    let originalPrice = product.price;
    
    if (hasDiscount && product.sale_price != null) {
      if (product.sale_price < product.price) {
        currentPrice = product.sale_price;
        originalPrice = product.price;
      } else {
        currentPrice = product.price;
        originalPrice = product.sale_price;
      }
    }
    
    return { currentPrice, originalPrice, hasDiscount };
  }, [product.price, product.sale_price]);
  
  // Memoize recency badge calculation
  const recencyBadge = useMemo(() => getRecencyBadge(product.created_at), [product.created_at]);

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
                  contentFit="cover"
                  transition={200}
                  priority="normal"
                  cachePolicy="disk"
                  recyclingKey={imageUrl}
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
            <Image 
              source={{ uri: allImages[0] || '' }} 
              style={styles.image} 
              contentFit="cover"
              transition={200}
              priority="normal"
              cachePolicy="disk"
              recyclingKey={allImages[0] || ''}
            />
          </Pressable>
        )}

        {/* Recency Badge */}
        {recencyBadge && (
          <View style={styles.recencyBadge}>
            <Text style={styles.recencyText}>
              {recencyBadge}
            </Text>
          </View>
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
    marginBottom: 0,
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
  recencyBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    zIndex: 1,
  },
  recencyText: {
    fontFamily: 'AbrilFatface-Regular',
    fontSize: 16,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
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
    marginBottom: 12,
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
