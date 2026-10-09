import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Meta } from './Text';
import { colors, space } from './theme';

/**
 * Every value that came from a document, a person, or a partner carries its
 * source: "source · discharge document p. 2", "entered by you", "quote · Puente".
 */
export function Provenance({ children, color = colors.inkMuted }: { children: string; color?: string }) {
  return (
    <View style={styles.row}>
      <Meta color={color}>§</Meta>
      <Meta color={color} style={styles.text}>
        {children}
      </Meta>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  text: { flexShrink: 1 },
});
