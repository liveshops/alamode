import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface ZoomableImageProps {
  uri: string;
  style: ViewStyle;
}

/**
 * Inline pinch-to-zoom image. Zooms on pinch, springs back to 1x on release.
 */
export function ZoomableImage({ uri, style }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(e.scale, 4));
      focalX.value = e.focalX;
      focalY.value = e.focalY;
    })
    .onEnd(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={pinch}>
      <Animated.View style={[style, animatedStyle]}>
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="cover"
          transition={200}
          priority="high"
          cachePolicy="disk"
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
});
