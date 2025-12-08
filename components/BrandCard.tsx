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

interface BrandCardProps {
  brand: Brand;
  isFollowing: boolean;
  onPress: () => void;
  onToggleFollow: () => void;
}

export function BrandCard({ brand, isFollowing, onPress, onToggleFollow }: BrandCardProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.9}>
      {/* Brand Logo */}
      {brand.logo_url ? (
        <Image source={{ uri: brand.logo_url }} style={styles.logo} resizeMode="contain" />
      ) : (
        <View style={styles.logoPlaceholder}>
          <Text style={styles.logoText}>{brand.name[0]}</Text>
        </View>
      )}

      {/* Brand Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.brandName}>{brand.name}</Text>
        <Text style={styles.followerCount}>{brand.follower_count} followers</Text>
      </View>

      {/* Following Button */}
      <TouchableOpacity
        style={[styles.followButton, isFollowing && styles.followingButton]}
        onPress={(e) => {
          e.stopPropagation();
          onToggleFollow();
        }}
        activeOpacity={0.7}>
        <Ionicons 
          name={isFollowing ? "checkmark" : "add"} 
          size={20} 
          color={isFollowing ? "#000" : "#fff"} 
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  logoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 16,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 4,
  },
  followerCount: {
    fontSize: 14,
    color: '#666',
  },
  followButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  followingButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#000',
  },
});
