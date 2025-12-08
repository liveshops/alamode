import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  follower_count: number;
}

interface BrandGridCardProps {
  brand: Brand;
  isFollowing: boolean;
  onPress: () => void;
  onToggleFollow: () => void;
}

export function BrandGridCard({ brand, isFollowing, onPress, onToggleFollow }: BrandGridCardProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.9}>
      {/* Brand Logo */}
      <View style={styles.logoContainer}>
        {brand.logo_url ? (
          <Image source={{ uri: brand.logo_url }} style={styles.logo} resizeMode="contain" />
        ) : (
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>{brand.name[0]}</Text>
          </View>
        )}
        
        {/* Follow Button */}
        <TouchableOpacity
          style={[styles.followButton, isFollowing && styles.followingButton]}
          onPress={(e) => {
            e.stopPropagation();
            onToggleFollow();
          }}
          activeOpacity={0.7}>
          <Ionicons 
            name={isFollowing ? "checkmark" : "add"} 
            size={16} 
            color={isFollowing ? "#000" : "#fff"} 
          />
        </TouchableOpacity>
      </View>

      {/* Brand Info */}
      <Text style={styles.brandName} numberOfLines={1}>
        {brand.name}
      </Text>
      <Text style={styles.followerCount}>{brand.follower_count} followers</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginBottom: 24,
    alignItems: 'center',
  },
  logoContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 40,
    fontWeight: '600',
    color: '#fff',
  },
  followButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  followingButton: {
    backgroundColor: '#fff',
    borderColor: '#000',
  },
  brandName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  followerCount: {
    fontSize: 12,
    color: '#666',
  },
});
