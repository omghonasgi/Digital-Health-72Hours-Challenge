import { useMemo } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { PlannedReminder } from './plan';

export interface ReminderText {
  title: string;
  body: string;
}
export type ReminderStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';
export interface ReminderResponse {
  /** Unique per delivered notification interaction. */
  key: string;
  notificationId: string;
  taskId: string;
  patientId?: string;
  done: boolean;
}

/**
 * Local scheduled notifications: these work in Expo Go on iOS and Android.
 * Remote (server-sent) push does not work in Expo Go on Android since SDK 53
 * and needs a development build, so nothing here depends on a push token.
 */
export const remindersSupported = true;
export const DONE_ACTION = 'done';
const CATEGORY = 'task';
const CHANNEL = 'task-reminders';
const PREFIX = 'task:';

let ready: Promise<void> | null = null;
let categoryLabel = '';

export function initReminders() {
  ready ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Recovery task reminders', importance: Notifications.AndroidImportance.HIGH });
    }
  })().catch(() => undefined);
  return ready;
}

async function ensureCategory(doneLabel: string) {
  if (categoryLabel === doneLabel) return;
  // Opening the app on "Done" keeps the report reliable: Expo Go does not run JS for background actions.
  await Notifications.setNotificationCategoryAsync(CATEGORY, [{ identifier: DONE_ACTION, buttonTitle: doneLabel, options: { opensAppToForeground: true } }]);
  categoryLabel = doneLabel;
}

const toStatus = (p: Notifications.NotificationPermissionsStatus): ReminderStatus => {
  const provisional = p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  return p.granted || provisional ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
};

export async function reminderPermission(): Promise<ReminderStatus> {
  return toStatus(await Notifications.getPermissionsAsync());
}

export async function requestReminderPermission(): Promise<ReminderStatus> {
  await initReminders();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) return toStatus(current);
  return toStatus(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
}

const content = (r: PlannedReminder, text: ReminderText): Notifications.NotificationContentInput => ({
  title: text.title,
  body: text.body,
  sound: true,
  categoryIdentifier: CATEGORY,
  data: { taskId: r.taskId, patientId: r.patientId, kind: r.kind },
});

export async function cancelReminders() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(pending.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

/** Replaces every pending task reminder on this device with `planned`. Returns how many are now scheduled. */
export async function syncReminders(planned: PlannedReminder[], text: (r: PlannedReminder) => ReminderText, doneLabel: string): Promise<number> {
  await initReminders();
  if ((await reminderPermission()) !== 'granted') return 0;
  await ensureCategory(doneLabel);
  await cancelReminders();
  let n = 0;
  for (const r of planned) {
    if (r.fireAt <= Date.now() + 1000) continue;
    // An absolute instant, so the reminder is correct whatever zone the phone is in.
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: content(r, text(r)),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.fireAt), channelId: CHANNEL },
    });
    n += 1;
  }
  return n;
}

/** Fires one real reminder a few seconds from now so the flow can be shown without waiting for the scheduled time. */
export async function previewReminder(r: PlannedReminder, text: ReminderText, doneLabel: string, seconds = 5) {
  await initReminders();
  await ensureCategory(doneLabel);
  await Notifications.scheduleNotificationAsync({
    identifier: `preview:${r.taskId}`,
    content: content(r, text),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL },
  });
}

export async function dismissReminder(notificationId: string) {
  await Notifications.dismissNotificationAsync(notificationId).catch(() => undefined);
}

/** The most recent tap on a task reminder (body or its "Done" button), including the one that launched the app. */
export function useReminderResponse(): ReminderResponse | null {
  const last = Notifications.useLastNotificationResponse();
  return useMemo(() => {
    if (!last) return null;
    const req = last.notification.request;
    const data = req.content.data as { taskId?: unknown; patientId?: unknown } | undefined;
    if (typeof data?.taskId !== 'string') return null;
    return {
      key: `${req.identifier}:${last.notification.date}:${last.actionIdentifier}`,
      notificationId: req.identifier,
      taskId: data.taskId,
      patientId: typeof data.patientId === 'string' ? data.patientId : undefined,
      done: last.actionIdentifier === DONE_ACTION,
    };
  }, [last]);
}
