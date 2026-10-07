import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Item } from './items';

export type RewardStatus = 'active' | 'earned' | 'expired' | 'claimed';

export type Reward = {
    id: number;
    title: string;
    description: string | null;
    /** UTC timestamp. */
    deadline: string;
    status: RewardStatus;
    earned_at: string | null;
    claimed_at: string | null;
    /** null means the reward is for both people. */
    beneficiary_user_id: number | null;
    /** The linked tasks that still exist. */
    items: Item[];
};

export type RewardInput = {
    title: string;
    description: string | null;
    /** YYYY-MM-DD: the reward is due by the end of that day. */
    deadline: string;
    beneficiary_user_id: number | null;
    item_ids: number[];
};

const KEY = ['rewards'];

export function useRewards() {
    return useQuery({ queryKey: KEY, queryFn: () => api<Reward[]>('/api/rewards') });
}

export function useSaveReward() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, ...input }: RewardInput & { id?: number }) =>
            id === undefined
                ? api<Reward>('/api/rewards', { method: 'POST', body: input })
                : api<Reward>(`/api/rewards/${id}`, { method: 'PATCH', body: input }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    });
}

export function useDeleteReward() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => api(`/api/rewards/${id}`, { method: 'DELETE' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    });
}

export function useClaimReward() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => api<Reward>(`/api/rewards/${id}/claim`, { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    });
}

/** The linked tasks that count: dropped ones no longer do. */
export const countedItems = (reward: Reward) =>
    reward.items.filter((item) => item.status !== 'dropped');
