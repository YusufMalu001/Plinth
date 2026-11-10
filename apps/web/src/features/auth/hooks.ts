'use client';

import { useQuery } from '@tanstack/react-query';
import { authApi } from './api';

export const authKeys = { me: ['auth', 'me'] as const };

/** Shared, cached session query used by the shell and protected pages. */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: authApi.currentUser,
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
}
