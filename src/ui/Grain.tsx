import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const tile = require('../../assets/grain.png');

/**
 * The grain overlay required on every non-status surface. A tiled,
 * transparent noise PNG; opacity is set by the surface (see theme.grainOpacity).
 */
export function Grain({ opacity }: { opacity: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Explicit 100% size: react-native-web otherwise falls back to the tile's intrinsic 128px. */}
      <Image source={tile} resizeMode="repeat" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity }} />
    </View>
  );
}
