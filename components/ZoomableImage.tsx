import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

interface ZoomableImageProps {
  uri: string;
  style: ViewStyle;
}

/**
 * Inline pinch-to-zoom image with pan support.
 * - Pinch to zoom (up to 4x), zooms toward focal point
 * - Pan to move around when zoomed in
 * - Snaps back to 1x on release (no bounce)
 */
export function ZoomableImage({ uri, style }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const pinchStartFocalX = useSharedValue(0);
  const pinchStartFocalY = useSharedValue(0);

  const snapBack = () => {
    'worklet';
    scale.value = withTiming(1, { duration: 200 });
    translateX.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(0, { duration: 200 });
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      pinchStartFocalX.value = e.focalX;
      pinchStartFocalY.value = e.focalY;
    })
    .onUpdate((e) => {
      const newScale = Math.max(1, Math.min(savedScale.value * e.scale, 4));
      scale.value = newScale;

      // Translate toward the focal point as we zoom
      if (newScale > 1) {
        const focalOffsetX = (pinchStartFocalX.value - 0.5 * (style.width as number || 300));
        const focalOffsetY = (pinchStartFocalY.value - 0.5 * (style.height as number || 400));
        const scaleDiff = newScale / savedScale.value - 1;
        translateX.value = savedTranslateX.value - focalOffsetX * scaleDiff;
        translateY.value = savedTranslateY.value - focalOffsetY * scaleDiff;
      }
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        snapBack();
      } else {
        savedScale.value = scale.value;
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((e, state) => {
      // Only activate pan when zoomed in — otherwise fail so carousel can swipe
      if (savedScale.value > 1) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        snapBack();
      } else {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureHandlerRootView style={[style, styles.overflow]}>
      <GestureDetector gesture={composed}>
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
  overflow: {
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
