import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { useEffect, useState } from 'react';

export interface Product {
  id: string;
  brand_id: string;
  external_id: string;
  name: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  currency: string;
  image_url: string;
  additional_images: string[] | null;
  product_url: string;
  like_count: number;
  is_available: boolean;
  created_at: string;
  brand: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
  is_liked?: boolean;
}

export function useProducts(initialLimit = 20) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const fetchProducts = async (loadMore = false) => {
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

      // Use optimized database function with pagination
      const { data: productsData, error: productsError } = await supabase
        .rpc('get_user_feed', {
          p_user_id: user.id,
          p_limit: initialLimit,
          p_offset: currentOffset
        });

      if (productsError) throw productsError;

      // Map to expected format
      const productsWithBrand = (productsData || []).map((product: any) => ({
        ...product,
        brand: {
          id: product.brand_id,
          name: product.brand_name,
          slug: product.brand_slug,
          logo_url: product.brand_logo_url,
        },
      }));

      if (loadMore) {
        setProducts((prev) => [...prev, ...productsWithBrand]);
        setOffset(currentOffset + productsWithBrand.length);
      } else {
        setProducts(productsWithBrand);
        setOffset(productsWithBrand.length);
      }

      // If we got fewer items than requested, we've reached the end
      setHasMore(productsWithBrand.length === initialLimit);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [user]);

  const toggleLike = async (productId: string) => {
    if (!user) return;

    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const wasLiked = product.is_liked;

    // Optimistic update
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              is_liked: !wasLiked,
              like_count: wasLiked ? Math.max(0, p.like_count - 1) : p.like_count + 1,
            }
          : p
      )
    );

    try {
      if (wasLiked) {
        // Unlike - delete the record
        await supabase
          .from('user_likes_products')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);
      } else {
        // Like - use upsert to avoid duplicate key errors
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
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                is_liked: wasLiked,
                like_count: wasLiked ? p.like_count + 1 : Math.max(0, p.like_count - 1),
              }
            : p
        )
      );
    }
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      fetchProducts(true);
    }
  };

  return {
    products,
    loading,
    loadingMore,
    error,
    hasMore,
    refetch: () => fetchProducts(false),
    loadMore,
    toggleLike,
  };
}
