import { Product } from '@/hooks/useProducts';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PRODUCT_IMAGE_WIDTH = (SCREEN_WIDTH - 48) / 2.5; // Show 2.5 products
const PRODUCT_IMAGE_HEIGHT = PRODUCT_IMAGE_WIDTH * 1.4;

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

interface BrandRowCardProps {
  brandName: string;
  brandSlug: string;
  isFollowing: boolean;
  followerCount: number;
  products: Product[];
  onBrandPress: () => void;
  onToggleFollow: () => void;
  onProductPress: (productId: string) => void;
  onToggleLike: (productId: string) => void;
}

export function BrandRowCard({
  brandName,
  brandSlug,
  isFollowing,
  followerCount,
  products,
  onBrandPress,
  onToggleFollow,
  onProductPress,
  onToggleLike,
}: BrandRowCardProps) {
  return (
    <View style={styles.container}>
      {/* Brand Header */}
      <View style={styles.brandHeader}>
        <TouchableOpacity
          style={styles.brandNameContainer}
          onPress={onBrandPress}
          activeOpacity={0.7}>
          <Text style={styles.brandName}>{brandName}</Text>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onToggleFollow();
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View
              style={[
                styles.brandHeartBadge,
                isFollowing && styles.brandHeartBadgeLiked,
              ]}>
              <Ionicons
                name={isFollowing ? 'heart' : 'heart-outline'}
                size={18}
                color={isFollowing ? '#fff' : '#000'}
              />
              {followerCount >= 1 && (
                <Text
                  style={[
                    styles.brandFollowerCount,
                    isFollowing && styles.brandFollowerCountLiked,
                  ]}>
                  {followerCount}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>

        <TouchableOpacity onPress={onBrandPress} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Products Carousel */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.productsContainer}
        decelerationRate="fast"
        snapToInterval={PRODUCT_IMAGE_WIDTH + 12}>
        {products.map((product, index) => (
          <TouchableOpacity
            key={product.id}
            style={[styles.productCard, index === 0 && styles.firstProduct]}
            onPress={() => onProductPress(product.id)}
            activeOpacity={0.9}>
            <Image
              source={{ uri: product.image_url }}
              style={styles.productImage}
              contentFit="cover"
            />
            {/* Recency badge */}
            {product.created_at && getRecencyBadge(product.created_at) && (
              <View style={styles.recencyBadge}>
                <Text style={styles.recencyText}>{getRecencyBadge(product.created_at)}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.productHeartButton}
              onPress={(e) => {
                e.stopPropagation();
                onToggleLike(product.id);
              }}
              activeOpacity={0.7}>
              <View
                style={[
                  styles.heartBadge,
                  product.is_liked && styles.heartBadgeLiked,
                ]}>
                <Ionicons
                  name={product.is_liked ? 'heart' : 'heart-outline'}
                  size={18}
                  color={product.is_liked ? '#fff' : '#000'}
                />
                {product.like_count >= 1 && (
                  <Text
                    style={[
                      styles.likeCount,
                      product.is_liked && styles.likeCountLiked,
                    ]}>
                    {product.like_count}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  brandNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  productsContainer: {
    paddingLeft: 16,
    paddingRight: 4,
  },
  productCard: {
    marginRight: 12,
    position: 'relative',
  },
  firstProduct: {
    marginLeft: 0,
  },
  productImage: {
    width: PRODUCT_IMAGE_WIDTH,
    height: PRODUCT_IMAGE_HEIGHT,
    backgroundColor: '#f5f5f5',
  },
  recencyBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  recencyText: {
    fontFamily: 'AbrilFatface-Regular',
    fontSize: 16,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  productHeartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
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
  brandHeartBadge: {
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
  brandHeartBadgeLiked: {
    backgroundColor: '#000',
  },
  brandFollowerCount: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
  brandFollowerCountLiked: {
    color: '#fff',
  },
});
