import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrApi, EmployeeFilterParams } from './api';
import { EmployeeDto, EmployeeTaskDto } from '@synergy/types';

export function useEmployees(filters?: EmployeeFilterParams) {
  const query = useQuery<EmployeeDto[]>({
    queryKey: ['employees', filters],
    queryFn: () => hrApi.getEmployees(filters),
    staleTime: 5_000,
    refetchOnMount: 'always',
  });

  return {
    employees: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Failed to fetch employees') : null,
    filters,
    setFilters: () => {},
    refetch: async () => {
      await query.refetch();
    },
  };
}
export function useEmployeeDetails(id?: string) {
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmployee = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await hrApi.getEmployeeById(id);
      setEmployee(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch employee details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  return {
    employee,
    loading,
    error,
    refetch: fetchEmployee
  };
}

export function useTasks(params?: {
  employeeId?: string;
  department?: string;
  status?: string;
  priority?: string;
  search?: string;
}) {
  const [tasks, setTasks] = useState<EmployeeTaskDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await hrApi.getTasks(params);
      setTasks(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return {
    tasks,
    loading,
    error,
    refetch: fetchTasks
  };
}
