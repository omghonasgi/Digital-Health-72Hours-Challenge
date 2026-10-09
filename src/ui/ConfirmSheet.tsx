import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Surface } from './Surface';
import { Body, Muted } from './Text';
import { colors, space } from './theme';

interface ConfirmProps {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
  destructive?: boolean;
  confirmDisabled?: boolean;
}

/**
 * The only modal in the product. Used solely before something hard to undo:
 * requesting a provider, confirming a caregiver, submitting an application,
 * sharing health information.
 */
export function ConfirmSheet({ visible, title, body, confirmLabel, cancelLabel, onConfirm, onCancel, children, destructive, confirmDisabled }: ConfirmProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel={cancelLabel}>
        <Pressable style={styles.sheetWrap} onPress={() => undefined}>
          <Surface tone="canvas" padded={space.xl} style={styles.sheet}>
            <Body size="large" weight="medium">
              {title}
            </Body>
            {body ? <Muted>{body}</Muted> : null}
            {children}
            <View style={styles.actions}>
              <Button label={cancelLabel} variant="quiet" onPress={onCancel} compact />
              <Button label={confirmLabel} variant={destructive ? 'danger' : 'hero'} onPress={onConfirm} compact disabled={confirmDisabled} />
            </View>
          </Surface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(31, 42, 54, 0.55)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  sheetWrap: { width: '100%', maxWidth: 520 },
  sheet: { gap: space.lg, borderWidth: 1, borderColor: colors.inkFaint },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.md, flexWrap: 'wrap' },
});
