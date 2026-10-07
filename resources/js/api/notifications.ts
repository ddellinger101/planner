import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { SubscriptionKeys } from '@/lib/push';

export type NotificationPreferences = {
    /** A reminder before each task that has a time. */
    tasks: boolean;
    task_lead_minutes: number;
    morning: boolean;
    morning_time: string;
    evening: boolean;
    evening_time: string;
    /** Sunday: plan the week ahead. */
    weekly: boolean;
    weekly_time: string;
    /** The 1st: review last month and set this month's goals. */
    monthly: boolean;
    rewards: boolean;
};

export type NotificationStatus = {
    /** False until the server has been given its keys; nothing can be sent before then. */
    configured: boolean;
    vapid_public_key: string | null;
    /** How many of this person's devices have notifications on. */
    devices: number;
    preferences: NotificationPreferences;
};

const KEY = ['notifications'];

export function useNotifications() {
    return useQuery({
        queryKey: KEY,
        queryFn: () => api<NotificationStatus>('/api/notifications'),
    });
}

export function useSavePreferences() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (changes: Partial<NotificationPreferences>) =>
            api<NotificationStatus>('/api/notifications', { method: 'PATCH', body: changes }),
        onSuccess: (status) => queryClient.setQueryData(KEY, status),
    });
}

export const saveSubscription = (subscription: SubscriptionKeys) =>
    api<NotificationStatus>('/api/notifications/subscriptions', {
        method: 'POST',
        body: subscription,
    });

export const forgetSubscription = (endpoint: string) =>
    api<null>('/api/notifications/subscriptions', { method: 'DELETE', body: { endpoint } });

export const sendTestNotification = () =>
    api<{ sent: number }>('/api/notifications/test', { method: 'POST' });
