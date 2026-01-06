import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface RecommendedProduct {
  id: string;
  product_id: string;
  name: string;
  price: number;
  sale_price: number | null;
  image_url: string;
  additional_images: string[] | null;
  product_url: string;
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  taxonomy_category_name: string | null;
  like_count: number;
  is_liked_by_user: boolean;
  recommendation_score: number;
  recommendation_reason: string;
  created_at: string;
  brand: {
    id: string;
    name: string;
    slug: string;
  };
  is_liked?: boolean;
}

export interface SimilarProduct {
  id: string;
  product_id: string;
  name: string;
  price: number;
  sale_price: number | null;
  image_url: string;
  product_url: string;
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  taxonomy_category_name: string | null;
  like_count: number;
  similarity_score: number;
  similarity_reason: string;
  created_at?: string;
  is_liked?: boolean;
  brand: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Hook for fetching personalized product recommendations for the current user.
 * Uses the get_recommendations SQL function with content-based + rule-based hybrid algorithm.
 * 
 * Algorithm weights:
 * - Brand affinity: 40%
 * - Category match: 35%
 * - Freshness + Popularity: 20%
 * - Price range: 5%
 */
export function useRecommendations(initialLimit = 20) {
  const { user } = useAuth();
  const [products, setProducts] = useState<RecommendedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const productsRef = useRef<RecommendedProduct[]>([]);
  const shownProductIds = useRef<Set<string>>(new Set());
  const consecutiveDuplicates = useRef(0);
  const fallbackOffset = useRef(0);
  
  // Keep ref in sync with state for deduplication checks
  productsRef.current = products;

  // Fallback function to fetch discovery products when recommendations are exhausted
  const fetchDiscoveryProducts = async () => {
    if (!user) return;
    
    try {
      // Fetch random products ordered by a mix of recency and randomness
      // Exclude products already shown in this session
      const shownIds = Array.from(shownProductIds.current);
      const currentFallbackOffset = fallbackOffset.current;
      
      // Use different ordering strategies based on fallback attempts
      const orderStrategies = ['created_at', 'like_count', 'random'];
      const strategyIndex = Math.floor(currentFallbackOffset / (initialLimit * 3)) % orderStrategies.length;
      
      let query = supabase
        .from('products')
        .select(`
          id, name, price, sale_price, image_url, additional_images, product_url, like_count, 
          taxonomy_category_name, created_at,
          brand:brands(id, name, slug)
        `)
        .eq('is_available', true);
      
      // Exclude already shown products (limit to last 500 to avoid query issues)
      if (shownIds.length > 0) {
        const recentShownIds = shownIds.slice(-500);
        query = query.not('id', 'in', `(${recentShownIds.join(',')})`);
      }
      
      // Apply ordering strategy
      if (strategyIndex === 0) {
        query = query.order('created_at', { ascending: false });
      } else if (strategyIndex === 1) {
        query = query.order('like_count', { ascending: false });
      } else {
        // Random-ish ordering using modulo on offset
        query = query.order('created_at', { ascending: (currentFallbackOffset % 2 === 0) });
      }
      
      const { data: discoveryData, error: discoveryError } = await query
        .range(currentFallbackOffset % 1000, (currentFallbackOffset % 1000) + initialLimit - 1);
      
      if (discoveryError) {
        console.error('[discovery] Error:', discoveryError);
        return;
      }
      
      if (!discoveryData || discoveryData.length === 0) {
        console.log('[discovery] No products found, resetting fallback offset');
        fallbackOffset.current = 0;
        return;
      }
      
      // Check like status for these products
      const productIds = discoveryData.map((p: any) => p.id);
      const { data: likedData } = await supabase
        .from('user_likes_products')
        .select('product_id')
        .eq('user_id', user.id)
        .in('product_id', productIds);
      
      const likedIds = new Set(likedData?.map(l => l.product_id) || []);
      
      // Map to RecommendedProduct format
      const mappedDiscovery: RecommendedProduct[] = discoveryData
        .filter((item: any) => !likedIds.has(item.id)) // Exclude liked products
        .map((item: any) => ({
          ...item,
          product_id: item.id,
          brand_id: item.brand?.id,
          brand_name: item.brand?.name,
          brand_slug: item.brand?.slug,
          is_liked_by_user: false,
          is_liked: false,
          recommendation_score: 0,
          recommendation_reason: 'Discover something new',
        }));
      
      // Filter out any that were already shown
      const newDiscovery = mappedDiscovery.filter(p => !shownProductIds.current.has(p.id));
      
      if (newDiscovery.length > 0) {
        console.log(`[discovery] Found ${newDiscovery.length} new products`);
        newDiscovery.forEach(p => shownProductIds.current.add(p.id));
        setProducts(prev => [...prev, ...newDiscovery]);
        
        // Record impressions (fire and forget)
        supabase.rpc('record_product_impressions', {
          p_user_id: user.id,
          p_product_ids: newDiscovery.map(p => p.id),
        }).then(({ error }) => {
          if (error) console.log('Discovery impression tracking skipped:', error.message);
        });
      }
      
      fallbackOffset.current = currentFallbackOffset + initialLimit;
    } catch (err) {
      console.error('[discovery] Error fetching discovery products:', err);
    }
  };

  const fetchRecommendations = useCallback(async (loadMore = false) => {
    if (!user) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setOffset(0);
        setHasMore(true);
      }
      setError(null);

      const currentOffset = loadMore ? offset : 0;

      const currentSeed = loadMore ? refreshSeed : Math.floor(Math.random() * 1000);
      
      if (!loadMore) {
        setRefreshSeed(currentSeed);
      }

      const { data, error: rpcError } = await supabase.rpc('get_recommendations', {
        target_user_id: user.id,
        result_limit: initialLimit,
        offset_val: currentOffset,
        refresh_seed: currentSeed,
      });

      if (rpcError) throw rpcError;

      // Map to expected format with nested brand object
      const mappedProducts: RecommendedProduct[] = (data || []).map((item: any) => ({
        ...item,
        id: item.product_id,
        is_liked: item.is_liked_by_user,
        brand: {
          id: item.brand_id,
          name: item.brand_name,
          slug: item.brand_slug,
        },
      }));

      // Record impressions for shown products (fire and forget)
      if (mappedProducts.length > 0) {
        const productIds = mappedProducts.map(p => p.product_id);
        supabase.rpc('record_product_impressions', {
          p_user_id: user.id,
          p_product_ids: productIds,
        }).then(({ error }) => {
          if (error) console.log('Impression tracking skipped:', error.message);
        });
      }

      if (loadMore) {
        // Deduplicate using functional setState to ensure we use the latest state
        let newProductsCount = 0;
        setProducts((prev) => {
          const existingIds = new Set(prev.map(p => p.id));
          const newProducts = mappedProducts.filter(p => !existingIds.has(p.id) && !shownProductIds.current.has(p.id));
          newProductsCount = newProducts.length;
          
          // Track all shown products
          newProducts.forEach(p => shownProductIds.current.add(p.id));
          
          console.log(`[loadMore] API returned: ${mappedProducts.length}, New unique: ${newProducts.length}, Current total: ${prev.length}, Offset: ${currentOffset}`);
          
          return newProducts.length > 0 ? [...prev, ...newProducts] : prev;
        });
        
        if (newProductsCount > 0) {
          consecutiveDuplicates.current = 0;
          setOffset(currentOffset + mappedProducts.length);
        } else if (mappedProducts.length > 0) {
          // All products were duplicates - try different strategies
          consecutiveDuplicates.current++;
          console.log(`[loadMore] Consecutive duplicate batches: ${consecutiveDuplicates.current}`);
          
          if (consecutiveDuplicates.current < 3) {
            // Strategy 1: Jump ahead in offset with new seed
            const newSeed = Math.floor(Math.random() * 10000);
            const jumpOffset = currentOffset + (initialLimit * consecutiveDuplicates.current * 5);
            setRefreshSeed(newSeed);
            setOffset(jumpOffset);
            console.log(`[loadMore] Jumping to offset ${jumpOffset} with seed ${newSeed}`);
          } else {
            // Strategy 2: Fallback to discovery products (random products user hasn't seen)
            console.log('[loadMore] Using discovery fallback');
            await fetchDiscoveryProducts();
            consecutiveDuplicates.current = 0;
          }
        } else {
          // API returned 0 products - use discovery fallback
          console.log('[loadMore] API returned 0 - using discovery fallback');
          await fetchDiscoveryProducts();
        }
        // Never set hasMore to false - always have more with 100k products
      } else {
        console.log(`[initial] Loaded ${mappedProducts.length} products`);
        // Track shown products
        shownProductIds.current = new Set(mappedProducts.map(p => p.id));
        consecutiveDuplicates.current = 0;
        fallbackOffset.current = 0;
        setProducts(mappedProducts);
        setOffset(mappedProducts.length);
      }
    } catch (err) {
      console.error('Error fetching recommendations:', err);
      setError(err instanceof Error ? err.message : 'Failed to load recommendations');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, offset, initialLimit, refreshSeed]);

  useEffect(() => {
    fetchRecommendations();
  }, [user]);

  const toggleLike = async (productId: string) => {
    if (!user) return;

    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const wasLiked = product.is_liked ?? false;

    const newLikedState = !wasLiked;
    const newLikeCount = wasLiked ? Math.max(0, product.like_count - 1) : product.like_count + 1;

    // Optimistic update
    setProducts((prev) =>
      prev.map((p): RecommendedProduct =>
        p.id === productId
          ? {
              ...p,
              is_liked: newLikedState,
              is_liked_by_user: newLikedState,
              like_count: newLikeCount,
            }
          : p
      )
    );

    try {
      if (wasLiked) {
        await supabase
          .from('user_likes_products')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);
      } else {
        const { error } = await supabase
          .from('user_likes_products')
          .upsert(
            { user_id: user.id, product_id: productId },
            { onConflict: 'user_id,product_id', ignoreDuplicates: true }
          );

        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling like:', err);
      // Revert optimistic update on error
      const revertLikeCount = wasLiked ? product.like_count + 1 : Math.max(0, product.like_count - 1);
      setProducts((prev) =>
        prev.map((p): RecommendedProduct =>
          p.id === productId
            ? {
                ...p,
                is_liked: wasLiked,
                is_liked_by_user: wasLiked,
                like_count: revertLikeCount,
              }
            : p
        )
      );
    }
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      fetchRecommendations(true);
    }
  };

  return {
    products,
    loading,
    loadingMore,
    error,
    hasMore,
    refetch: () => fetchRecommendations(false),
    loadMore,
    toggleLike,
  };
}

/**
 * Hook for fetching similar products to a given product.
 * Uses the get_similar_products SQL function with pagination.
 * Passes user ID to enable discovery bonus for brands user doesn't follow.
 */
export function useSimilarProducts(productId: string | null, initialLimit = 6) {
  const { user } = useAuth();
  const [products, setProducts] = useState<SimilarProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchSimilarProducts = useCallback(async (reset = true) => {
    if (!productId) {
      setProducts([]);
      return;
    }

    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      }
      setError(null);

      const currentOffset = reset ? 0 : offset;

      // Try new function signature with for_user_id, fall back to old signature
      let data, rpcError;
      
      // First try with for_user_id (new function after migration)
      const result = await supabase.rpc('get_similar_products', {
        source_product_id: productId,
        result_limit: initialLimit,
        result_offset: currentOffset,
        for_user_id: user?.id || null,
      });
      
      if (result.error?.code === 'PGRST202') {
        // Function signature mismatch - use old signature without for_user_id
        const fallbackResult = await supabase.rpc('get_similar_products', {
          source_product_id: productId,
          result_limit: initialLimit,
          result_offset: currentOffset,
        });
        data = fallbackResult.data;
        rpcError = fallbackResult.error;
      } else {
        data = result.data;
        rpcError = result.error;
      }

      if (rpcError) throw rpcError;

      // Map to expected format with nested brand object
      let mappedProducts: SimilarProduct[] = (data || []).map((item: any) => ({
        ...item,
        id: item.product_id,
        is_liked: false,
        brand: {
          id: item.brand_id,
          name: item.brand_name,
          slug: item.brand_slug,
        },
      }));

      // Fetch like status for products if user is logged in
      if (user && mappedProducts.length > 0) {
        const productIds = mappedProducts.map(p => p.id);
        const { data: likedData } = await supabase
          .from('user_likes_products')
          .select('product_id')
          .eq('user_id', user.id)
          .in('product_id', productIds);

        const likedIds = new Set(likedData?.map(l => l.product_id) || []);
        mappedProducts = mappedProducts.map(p => ({
          ...p,
          is_liked: likedIds.has(p.id),
        }));
      }

      if (reset) {
        setProducts(mappedProducts);
        setOffset(initialLimit);
      } else {
        // Filter duplicates
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newProducts = mappedProducts.filter(p => !existingIds.has(p.id));
          return [...prev, ...newProducts];
        });
        setOffset(prev => prev + initialLimit);
      }

      setHasMore(mappedProducts.length === initialLimit);
    } catch (err) {
      console.error('Error fetching similar products:', err);
      setError(err instanceof Error ? err.message : 'Failed to load similar products');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [productId, initialLimit, offset, user]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchSimilarProducts(false);
  };

  useEffect(() => {
    fetchSimilarProducts(true);
  }, [productId]);

  const toggleLike = async (targetProductId: string) => {
    if (!user) return;

    const product = products.find(p => p.id === targetProductId);
    if (!product) return;

    const wasLiked = product.is_liked ?? false;

    // Optimistic update
    setProducts(prev =>
      prev.map(p =>
        p.id === targetProductId
          ? { ...p, is_liked: !wasLiked, like_count: wasLiked ? Math.max(0, p.like_count - 1) : p.like_count + 1 }
          : p
      )
    );

    try {
      if (wasLiked) {
        await supabase
          .from('user_likes_products')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', targetProductId);
      } else {
        const { error } = await supabase
          .from('user_likes_products')
          .upsert(
            { user_id: user.id, product_id: targetProductId },
            { onConflict: 'user_id,product_id', ignoreDuplicates: true }
          );
        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling like:', err);
      // Revert on error
      setProducts(prev =>
        prev.map(p =>
          p.id === targetProductId
            ? { ...p, is_liked: wasLiked, like_count: wasLiked ? p.like_count + 1 : Math.max(0, p.like_count - 1) }
            : p
        )
      );
    }
  };

  return {
    products,
    loading,
    loadingMore,
    error,
    hasMore,
    refetch: () => fetchSimilarProducts(true),
    loadMore,
    toggleLike,
  };
}
