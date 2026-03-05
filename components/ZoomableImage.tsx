import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
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

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(e.scale, 4));
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
    <GestureHandlerRootView style={style}>
      <GestureDetector gesture={pinch}>
        <Animated.View style={[styles.fill, animatedStyle]}>
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
