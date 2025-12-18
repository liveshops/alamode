import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { useCallback, useEffect, useState } from 'react';

export interface RecommendedProduct {
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
  is_liked_by_user: boolean;
  recommendation_score: number;
  recommendation_reason: string;
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

      if (loadMore) {
        setProducts((prev) => [...prev, ...mappedProducts]);
        setOffset(currentOffset + mappedProducts.length);
      } else {
        setProducts(mappedProducts);
        setOffset(mappedProducts.length);
      }

      setHasMore(mappedProducts.length === initialLimit);
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
      const mappedProducts: SimilarProduct[] = (data || []).map((item: any) => ({
        ...item,
        id: item.product_id,
        brand: {
          id: item.brand_id,
          name: item.brand_name,
          slug: item.brand_slug,
        },
      }));

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

  return {
    products,
    loading,
    loadingMore,
    error,
    hasMore,
    refetch: () => fetchSimilarProducts(true),
    loadMore,
  };
}
