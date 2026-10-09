import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Notification } from '@/core/types';
import { useSession } from '@/state/SessionProvider';
import { Body, Button, Card, Glyph, Icons, Meta, Muted, Row, colors, space } from '@/ui';
import { useFmt } from './format';

/** In-app notifications for the signed-in person: reminders, missed and blocked tasks. */
export function NotificationsPanel({ timezone, taskHref, limit = 5 }: { timezone: string; taskHref: (taskId: string) => Href; limit?: number }) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const router = useRouter();
  const { repo, session } = useSession();
  const [items, setItems] = useState<Notification[]>([]);
  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    repo
      .listNotifications(session.profile.id)
      .then((all) => {
        if (alive) setItems(all.filter((n) => n.status === 'unread').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [repo, session, limit, tick]);

  if (!items.length) return null;

  return (
    <Card>
      <Row>
        <Glyph icon={Icons.Bell} size={20} color={colors.blue} />
        <Body weight="medium">{t('notifications.title')}</Body>
      </Row>
      {items.map((n) => (
        <View key={n.id} style={styles.item}>
          <View style={{ flex: 1, gap: 2 }}>
            <Body>{n.messageKey === 'notifications.reminder' ? t('notifications.reminder', { minutes: n.messageParams?.minutes ?? 30 }) : n.messageKey === 'notifications.missed' ? t('notifications.missed') : n.messageKey === 'notifications.blocked' ? t('notifications.blocked') : n.message}</Body>
            <Muted>{n.message}</Muted>
            <Meta>{f.dateTime(n.createdAt)}</Meta>
          </View>
          <View style={{ gap: space.xs }}>
            {n.taskId ? <Button label={t('tasks.detail')} variant="quiet" compact onPress={() => router.push(taskHref(n.taskId!))} /> : null}
            <Button
              label={t('notifications.markRead')}
              variant="quiet"
              compact
              onPress={() => {
                void repo.markNotificationRead(n.id).then(() => load());
              }}
            />
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({ item: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' } });
