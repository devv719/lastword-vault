import { useState, useEffect, useCallback } from 'react';
import type { AsyncState } from '../types';

interface UseAsyncOptions<T> {
  immediate?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function useAsync<T>(
  asyncFunction: () => Promise<T>,
  deps: unknown[] = [],
  options: UseAsyncOptions<T> = { immediate: true }
) {
  const [state, setState] = useState<AsyncState>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const response = await asyncFunction();
      setData(response);
      if (Array.isArray(response) && response.length === 0) {
        setState('empty');
      } else {
        setState('success');
      }
      options.onSuccess?.(response);
      return response;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      setState('error');
      options.onError?.(e);
      throw e;
    }
  }, [asyncFunction]);

  useEffect(() => {
    if (options.immediate) {
      execute().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    state,
    data,
    error,
    isLoading: state === 'loading',
    isError: state === 'error',
    isEmpty: state === 'empty',
    isSuccess: state === 'success',
    execute,
    retry: execute,
    setData,
  };
}
