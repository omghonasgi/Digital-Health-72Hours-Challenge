import type { PlannedReminder } from './plan';
import type { ReminderText, ReminderStatus, ReminderResponse } from './device';

/** expo-notifications has no web implementation; reminders are a phone feature. */
export const remindersSupported = false;
export const DONE_ACTION = 'done';
export async function initReminders() {}
export async function reminderPermission(): Promise<ReminderStatus> {
  return 'unsupported';
}
export async function requestReminderPermission(): Promise<ReminderStatus> {
  return 'unsupported';
}
export async function syncReminders(_planned: PlannedReminder[], _text: (r: PlannedReminder) => ReminderText, _doneLabel: string): Promise<number> {
  return 0;
}
export async function previewReminder(_r: PlannedReminder, _text: ReminderText, _doneLabel: string, _seconds = 5) {}
export async function cancelReminders() {}
export async function dismissReminder(_notificationId: string) {}
export function useReminderResponse(): ReminderResponse | null {
  return null;
}
