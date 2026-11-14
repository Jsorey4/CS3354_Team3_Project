/**
 * @author Preethi Seereddy (retry behaviour), shared by every form owner
 * @description A React hook for "Save" buttons. It runs the save, tracks the busy state, separates
 *   field-level validation errors from connectivity failures, and - when the server could not be reached
 *   even after the automatic retry - keeps the last attempt so the Retry banner can run it again or Cancel
 *   it, without ever clearing what the user typed.
 * @traces SE-NFR-04, UC-01, UC-05, UC-06, UC-17
 */
import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../services/apiClient';

export interface SaveState<TResult> {
  saving: boolean;
  /** Connectivity failure (timeout / offline) after the automatic retry: show <RetryBanner>. */
  networkError: ApiError | null;
  /** Any other server error (400 / 403 / 409 ...). */
  error: ApiError | null;
  fieldErrors: Record<string, string>;
  run: () => Promise<TResult | undefined>;
  retry: () => Promise<TResult | undefined>;
  cancel: () => void;
  reset: () => void;
}

export function useSave<TResult>(action: () => Promise<TResult>, onSuccess?: (result: TResult) => void): SaveState<TResult> {
  const [saving, setSaving] = useState(false);
  const [networkError, setNetworkError] = useState<ApiError | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const actionRef = useRef(action);
  actionRef.current = action;
  const successRef = useRef(onSuccess);
  successRef.current = onSuccess;

  const execute = useCallback(async (): Promise<TResult | undefined> => {
    setSaving(true);
    setError(null);
    setNetworkError(null);
    setFieldErrors({});
    try {
      const result = await actionRef.current();
      successRef.current?.(result);
      return result;
    } catch (err) {
      const apiErr =
        err instanceof ApiError ? err : new ApiError({ status: 0, detail: (err as Error)?.message ?? 'Unexpected error', isNetwork: true });
      if (apiErr.isConnectivity) setNetworkError(apiErr);
      else {
        setError(apiErr);
        setFieldErrors(apiErr.errors);
      }
      return undefined;
    } finally {
      setSaving(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setNetworkError(null);
    setFieldErrors({});
  }, []);

  return { saving, networkError, error, fieldErrors, run: execute, retry: execute, cancel: () => setNetworkError(null), reset };
}

/** Normalizes any thrown value into an ApiError for display. */
export function toApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError({ status: 0, detail: (err as Error)?.message ?? 'Unexpected error' });
}
