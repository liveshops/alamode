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

export function useProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    if (!user) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get brands the user follows
      const { data: followedBrands, error: followError } = await supabase
        .from('user_follows_brands')
        .select('brand_id')
        .eq('user_id', user.id);

      if (followError) throw followError;

      if (!followedBrands || followedBrands.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      const brandIds = followedBrands.map((fb) => fb.brand_id);

      // Fetch products from followed brands
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(
          `
          *,
          brand:brands(id, name, slug, logo_url)
        `
        )
        .in('brand_id', brandIds)
        .eq('is_available', true)
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;

      // Check which products are liked by the user
      const { data: likedProducts, error: likedError } = await supabase
        .from('user_likes_products')
        .select('product_id')
        .eq('user_id', user.id);

      if (likedError) throw likedError;

      const likedProductIds = new Set(likedProducts?.map((lp) => lp.product_id) || []);

      // Add is_liked property to products
      const productsWithLikes = (productsData || []).map((product) => ({
        ...product,
        is_liked: likedProductIds.has(product.id),
      }));

      setProducts(productsWithLikes);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
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

  return {
    products,
    loading,
    error,
    refetch: fetchProducts,
    toggleLike,
  };
}
