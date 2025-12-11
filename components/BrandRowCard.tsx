import { Product } from '@/hooks/useProducts';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PRODUCT_IMAGE_WIDTH = (SCREEN_WIDTH - 48) / 2.5; // Show 2.5 products
const PRODUCT_IMAGE_HEIGHT = PRODUCT_IMAGE_WIDTH * 1.4;

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
              resizeMode="cover"
            />
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
