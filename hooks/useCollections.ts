import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { useCallback, useEffect, useState } from 'react';

export interface CollectionPreviewProduct {
  id: string;
  name: string;
  image_url: string;
  price: number;
  sale_price: number | null;
  brand_name: string;
  brand_slug: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  product_count: number;
  created_at: string;
  preview_products: CollectionPreviewProduct[] | null;
}

export interface CollectionProduct {
  product_id: string;
  name: string;
  price: number;
  sale_price: number | null;
  image_url: string;
  additional_images: string[] | null;
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  like_count: number;
  is_liked: boolean;
  added_at: string;
}

export function useCollections(userId?: string) {
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetUserId = userId || user?.id;
  const isOwnProfile = !userId || userId === user?.id;

  const fetchCollections = useCallback(async () => {
    if (!targetUserId) {
      setCollections([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('get_user_collections', {
        p_user_id: targetUserId,
        p_viewer_id: user?.id || null,
      });

      if (rpcError) throw rpcError;

      setCollections(data || []);
    } catch (err) {
      console.error('Error fetching collections:', err);
      setError(err instanceof Error ? err.message : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, [targetUserId, user?.id]);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const createCollection = async (name: string, description?: string): Promise<string | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.rpc('create_collection', {
        p_user_id: user.id,
        p_name: name,
        p_description: description || null,
      });

      if (error) throw error;

      // Refresh collections
      await fetchCollections();

      return data as string;
    } catch (err) {
      console.error('Error creating collection:', err);
      return null;
    }
  };

  const deleteCollection = async (collectionId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await supabase.rpc('delete_collection', {
        p_user_id: user.id,
        p_collection_id: collectionId,
      });

      if (error) throw error;

      // Optimistic update
      setCollections((prev) => prev.filter((c) => c.id !== collectionId));

      return true;
    } catch (err) {
      console.error('Error deleting collection:', err);
      return false;
    }
  };

  const updateCollection = async (
    collectionId: string,
    updates: {
      name?: string;
      description?: string;
      cover_image_url?: string;
      is_public?: boolean;
    }
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await supabase.rpc('update_collection', {
        p_user_id: user.id,
        p_collection_id: collectionId,
        p_name: updates.name || null,
        p_description: updates.description || null,
        p_cover_image_url: updates.cover_image_url || null,
        p_is_public: updates.is_public ?? null,
      });

      if (error) throw error;

      // Optimistic update
      setCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                name: updates.name ?? c.name,
                description: updates.description ?? c.description,
                cover_image_url: updates.cover_image_url ?? c.cover_image_url,
                is_public: updates.is_public ?? c.is_public,
              }
            : c
        )
      );

      return true;
    } catch (err) {
      console.error('Error updating collection:', err);
      return false;
    }
  };

  const addProductToCollection = async (
    collectionId: string,
    productId: string
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await supabase.rpc('add_product_to_collection', {
        p_user_id: user.id,
        p_collection_id: collectionId,
        p_product_id: productId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        console.error('Add to collection failed:', result.error);
        return false;
      }

      // Refresh collections to get updated counts
      await fetchCollections();

      return true;
    } catch (err) {
      console.error('Error adding product to collection:', err);
      return false;
    }
  };

  const removeProductFromCollection = async (
    collectionId: string,
    productId: string
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await supabase.rpc('remove_product_from_collection', {
        p_user_id: user.id,
        p_collection_id: collectionId,
        p_product_id: productId,
      });

      if (error) throw error;

      return true;
    } catch (err) {
      console.error('Error removing product from collection:', err);
      return false;
    }
  };

  return {
    collections,
    loading,
    error,
    isOwnProfile,
    refetch: fetchCollections,
    createCollection,
    deleteCollection,
    updateCollection,
    addProductToCollection,
    removeProductFromCollection,
  };
}

export function useCollectionProducts(collectionId: string) {
  const { user } = useAuth();
  const [products, setProducts] = useState<CollectionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!collectionId) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('get_collection_products', {
        p_collection_id: collectionId,
        p_viewer_id: user?.id || null,
      });

      if (rpcError) throw rpcError;

      setProducts(data || []);
    } catch (err) {
      console.error('Error fetching collection products:', err);
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [collectionId, user?.id]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const toggleLike = async (productId: string) => {
    if (!user) return;

    const product = products.find((p) => p.product_id === productId);
    if (!product) return;

    const wasLiked = product.is_liked;
    const newLikedState = !wasLiked;
    const newLikeCount = wasLiked
      ? Math.max(0, product.like_count - 1)
      : product.like_count + 1;

    // Optimistic update
    setProducts((prev) =>
      prev.map((p) =>
        p.product_id === productId
          ? { ...p, is_liked: newLikedState, like_count: newLikeCount }
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
        await supabase
          .from('user_likes_products')
          .upsert(
            { user_id: user.id, product_id: productId },
            { onConflict: 'user_id,product_id', ignoreDuplicates: true }
          );
      }
    } catch (err) {
      // Revert on error
      setProducts((prev) =>
        prev.map((p) =>
          p.product_id === productId
            ? { ...p, is_liked: wasLiked, like_count: product.like_count }
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
