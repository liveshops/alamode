import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { useSimilarProducts } from '@/hooks/useRecommendations';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Linking,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = SCREEN_WIDTH * 1.25; // 4:5 aspect ratio

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  // Fetch similar products with pagination
  const { products: similarProducts, loading: loadingSimilar, loadingMore: loadingMoreSimilar, hasMore: hasMoreSimilar, loadMore: loadMoreSimilar, toggleLike: toggleSimilarLike } = useSimilarProducts(id || null, 6);

  const handleSimilarScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isNearEnd = layoutMeasurement.width + contentOffset.x >= contentSize.width - 100;
    if (isNearEnd && hasMoreSimilar && !loadingMoreSimilar) {
      loadMoreSimilar();
    }
  };

  // Combine main image with additional images
  const allImages = product
    ? [product.image_url, ...(product.additional_images || [])]
    : [];

  const fetchProduct = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('products')
        .select(
          `
          *,
          brand:brands(id, name, slug, logo_url)
        `
        )
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      setProduct(data);
      setLikeCount(data.like_count || 0);

      // Check if user has liked this product
      if (user) {
        const { data: likeData, error: likeError } = await supabase
          .from('user_likes_products')
          .select('user_id')
          .eq('user_id', user.id)
          .eq('product_id', id)
          .maybeSingle();

        if (likeError) {
          console.error('Error checking like status:', likeError);
        }
        
        setIsLiked(!!likeData);
      } else {
        setIsLiked(false);
      }
    } catch (err) {
      console.error('Error fetching product:', err);
      setError(err instanceof Error ? err.message : 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  // Refetch on screen focus to get latest like state
  useFocusEffect(
    useCallback(() => {
      fetchProduct();
    }, [fetchProduct])
  );

  const handleToggleLike = async () => {
    if (!user || !product) return;

    const wasLiked = isLiked;

    // Optimistic update
    setIsLiked(!wasLiked);
    setLikeCount((prev) => (wasLiked ? Math.max(0, prev - 1) : prev + 1));

    try {
      if (wasLiked) {
        // Unlike - delete the record
        const { error: deleteError } = await supabase
          .from('user_likes_products')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', product.id);
        
        if (deleteError) throw deleteError;
      } else {
        // Like - use upsert to avoid duplicate key errors
        const { error } = await supabase
          .from('user_likes_products')
          .upsert(
            { user_id: user.id, product_id: product.id },
            { onConflict: 'user_id,product_id', ignoreDuplicates: true }
          );

        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling like:', err);
      // Revert on error
      setIsLiked(wasLiked);
      setLikeCount((prev) => (wasLiked ? prev + 1 : Math.max(0, prev - 1)));
    }
  };

  const handleShare = async () => {
    if (!product) return;

    try {
      await Share.share({
        message: `Check out ${product.name} from ${product.brand.name}!\n${product.product_url}`,
        url: product.product_url,
      });
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  const handleBuy = () => {
    if (product?.product_url) {
      Linking.openURL(product.product_url);
    }
  };

  const handleImageScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setCurrentImageIndex(index);
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Failed to load product</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Determine which price is lower (the actual sale/current price)
  const hasDiscount = product.sale_price != null && product.sale_price !== product.price;
  
  // Always show the lower price as current, higher as original (struck through)
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitle}>cherry</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        {/* Image Carousel */}
        <View style={styles.imageSection}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={28} color="#000" />
          </TouchableOpacity>

          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleImageScroll}
            scrollEventThrottle={16}>
            {allImages.map((imageUrl, index) => (
              <Image
                key={index}
                source={{ uri: imageUrl }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ))}
          </ScrollView>

          {/* Heart Button */}
          <TouchableOpacity
            style={styles.heartButton}
            onPress={handleToggleLike}
            activeOpacity={0.7}>
            <View style={[styles.heartBadge, isLiked && styles.heartBadgeLiked]}>
              <Ionicons 
                name={isLiked ? "heart" : "heart-outline"} 
                size={20} 
                color={isLiked ? "#fff" : "#000"} 
              />
              {likeCount >= 1 && (
                <Text style={[styles.likeCountText, isLiked && styles.likeCountTextLiked]}>
                  {likeCount}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Pagination Dots */}
        {allImages.length > 1 && (
          <View style={styles.paginationContainer}>
            {allImages.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.paginationDot,
                  index === currentImageIndex && styles.paginationDotActive,
                ]}
              />
            ))}
          </View>
        )}

        {/* Product Info */}
        <View style={styles.infoSection}>
          {/* Title Row */}
          <View style={styles.titleRow}>
            <Text style={styles.productName}>{product.name.toUpperCase()}</Text>
            <TouchableOpacity onPress={handleShare} activeOpacity={0.7}>
              <Ionicons name="share-outline" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Price and Brand Row */}
          <View style={styles.priceRow}>
            <View style={styles.priceContainer}>
              <Text style={styles.price}>${currentPrice.toFixed(2)}</Text>
              {hasDiscount && (
                <Text style={styles.originalPrice}>${originalPrice.toFixed(2)}</Text>
              )}
            </View>
            <TouchableOpacity 
              onPress={() => router.push(`/brand/${product.brand.slug}`)}
              activeOpacity={0.7}>
              <Text style={styles.brandName}>{product.brand.name}</Text>
            </TouchableOpacity>
          </View>

          {/* Description */}
          {product.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.descriptionLabel}>Description:</Text>
              <Text style={styles.descriptionText}>{product.description}</Text>
            </View>
          )}

          {/* Similar Products */}
          {similarProducts.length > 0 && (
            <View style={styles.similarSection}>
              <Text style={styles.similarTitle}>You Might Also Like</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                onScroll={handleSimilarScroll}
                scrollEventThrottle={16}
                contentContainerStyle={styles.similarScrollContent}>
                {similarProducts.map((item) => (
                  <TouchableOpacity 
                    key={item.id} 
                    style={styles.similarProductCard}
                    onPress={() => router.push(`/product/${item.id}`)}
                    activeOpacity={0.8}>
                    <View style={styles.similarImageContainer}>
                      <Image 
                        source={{ uri: item.image_url }} 
                        style={styles.similarImage} 
                        resizeMode="cover" 
                      />
                      <TouchableOpacity 
                        style={styles.similarHeartBadge}
                        onPress={(e) => {
                          e.stopPropagation();
                          toggleSimilarLike(item.id);
                        }}
                        activeOpacity={0.7}>
                        <Ionicons 
                          name={item.is_liked ? "heart" : "heart-outline"} 
                          size={12} 
                          color={item.is_liked ? "#ff4444" : "#000"} 
                        />
                        {item.like_count > 0 && (
                          <Text style={styles.similarLikeCount}>{item.like_count}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.similarProductName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.similarBrandName}>{item.brand_name}</Text>
                    <Text style={styles.similarPrice}>
                      ${(item.sale_price || item.price).toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                ))}
                {loadingMoreSimilar && (
                  <View style={styles.similarLoadingMore}>
                    <ActivityIndicator size="small" color="#000" />
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={styles.backActionButton}
          onPress={() => router.back()}
          activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.buyButton} onPress={handleBuy} activeOpacity={0.8}>
          <Text style={styles.buyButtonText}>Buy</Text>
        </TouchableOpacity>
      </View>
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
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  backLink: {
    fontSize: 16,
    color: '#000',
    textDecorationLine: 'underline',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontFamily: 'AbrilFatface-Regular',
    fontSize: 24,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  imageSection: {
    position: 'relative',
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
  },
  backButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 10,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productImage: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
  },
  heartButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 10,
  },
  heartBadge: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  heartBadgeLiked: {
    backgroundColor: '#000',
  },
  likeCountText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  likeCountTextLiked: {
    color: '#fff',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ddd',
  },
  paginationDotActive: {
    backgroundColor: '#000',
  },
  infoSection: {
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
    flex: 1,
    marginRight: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  priceContainer: {
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
  brandName: {
    fontSize: 16,
    fontWeight: '300',
    fontStyle: 'italic',
  },
  descriptionSection: {
    marginTop: 4,
  },
  descriptionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
  },
  similarSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  similarTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  similarScrollContent: {
    paddingRight: 16,
    gap: 12,
  },
  similarProductCard: {
    width: 120,
    marginRight: 12,
  },
  similarImageContainer: {
    position: 'relative',
    width: 120,
    height: 160,
    backgroundColor: '#f5f5f5',
  },
  similarImage: {
    width: '100%',
    height: '100%',
  },
  similarHeartBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  similarLikeCount: {
    fontSize: 10,
    color: '#000',
    fontWeight: '500',
  },
  similarProductName: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 8,
    color: '#000',
  },
  similarBrandName: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 2,
  },
  similarPrice: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    color: '#000',
  },
  similarLoadingMore: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    gap: 12,
  },
  backActionButton: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyButton: {
    flex: 2,
    height: 48,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
