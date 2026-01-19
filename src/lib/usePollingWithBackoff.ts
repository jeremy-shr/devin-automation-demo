'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Polling state for UI feedback
 */
export type PollingState = 'normal' | 'degraded' | 'failed';

/**
 * Configuration for the polling hook
 */
export interface PollingConfig {
  /** Base polling interval in ms (default: 15000) */
  baseInterval?: number;
  /** Maximum backoff interval in ms (default: 60000) */
  maxBackoff?: number;
  /** Number of consecutive failures before entering 'failed' state (default: 5) */
  failureThreshold?: number;
}

/**
 * Result returned by the polling hook
 */
export interface PollingResult<T> {
  /** The fetched data */
  data: T | null;
  /** Current polling state */
  pollingState: PollingState;
  /** Whether polling is active */
  isPolling: boolean;
  /** Number of consecutive failures */
  failureCount: number;
  /** Seconds until next retry (only relevant when degraded) */
  retryInSeconds: number | null;
  /** Error message if any */
  error: string | null;
  /** Manual retry function */
  retry: () => void;
}

/**
 * Checks if an error is transient (should trigger backoff/retry)
 * Transient errors: 429 (rate limit), 502/503/504 (gateway errors), network errors
 */
function isTransientError(status: number | null, isNetworkError: boolean): boolean {
  if (isNetworkError) return true;
  if (status === null) return false;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Calculate exponential backoff interval
 * Formula: min(maxBackoff, baseInterval * 2^failureCount)
 */
function calculateBackoff(
  baseInterval: number,
  maxBackoff: number,
  failureCount: number
): number {
  const backoff = baseInterval * Math.pow(2, failureCount);
  return Math.min(backoff, maxBackoff);
}

/**
 * Custom hook for polling with exponential backoff on transient failures.
 * 
 * Features:
 * - Exponential backoff on transient failures (429, 502-504, network errors)
 * - Capped backoff (default max 60s)
 * - Resets to normal interval after successful poll
 * - Tracks polling state: normal, degraded, failed
 * - Provides retry countdown for UI feedback
 * 
 * @param fetchFn - Async function that fetches data
 * @param shouldStopPolling - Function that determines if polling should stop (e.g., terminal state)
 * @param config - Optional configuration
 */
export function usePollingWithBackoff<T>(
  fetchFn: () => Promise<{ data: T; status: number }>,
  shouldStopPolling: (data: T | null) => boolean,
  config: PollingConfig = {}
): PollingResult<T> {
  const {
    baseInterval = 15000,
    maxBackoff = 60000,
    failureThreshold = 5,
  } = config;

  const [data, setData] = useState<T | null>(null);
  const [pollingState, setPollingState] = useState<PollingState>('normal');
  const [isPolling, setIsPolling] = useState(true);
  const [failureCount, setFailureCount] = useState(0);
  const [retryInSeconds, setRetryInSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs to track current state in callbacks
  const failureCountRef = useRef(failureCount);
  const isPollingRef = useRef(isPolling);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync
  useEffect(() => {
    failureCountRef.current = failureCount;
  }, [failureCount]);

  useEffect(() => {
    isPollingRef.current = isPolling;
  }, [isPolling]);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Note: performFetch is intentionally not in the dependency array to avoid circular dependency.
  // We use performFetchRef to access the latest version of performFetch.
  const performFetchRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const scheduleNextPoll = useCallback((interval: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    // Set up countdown for UI
    let remaining = Math.ceil(interval / 1000);
    setRetryInSeconds(remaining);

    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setRetryInSeconds(remaining);
      } else {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setRetryInSeconds(null);
      }
    }, 1000);

    timerRef.current = setTimeout(() => {
      if (isPollingRef.current && performFetchRef.current) {
        performFetchRef.current();
      }
    }, interval);
  }, []);

  const performFetch = useCallback(async () => {
    try {
      const result = await fetchFn();
      
      // Success - reset backoff state
      setData(result.data);
      setError(null);
      setFailureCount(0);
      setPollingState('normal');
      setRetryInSeconds(null);

      // Check if we should stop polling
      if (shouldStopPolling(result.data)) {
        setIsPolling(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
        return;
      }

      // Schedule next poll at normal interval
      scheduleNextPoll(baseInterval);
    } catch (err) {
      // Determine error type
      let status: number | null = null;
      let isNetworkError = false;
      let errorMessage = 'Failed to fetch session';

      if (err instanceof Response) {
        status = err.status;
        errorMessage = `Request failed with status ${status}`;
      } else if (err instanceof Error) {
        // Check for fetch network errors
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
          isNetworkError = true;
          errorMessage = 'Network error';
        } else if ('status' in err && typeof (err as { status: unknown }).status === 'number') {
          status = (err as { status: number }).status;
          errorMessage = err.message;
        } else {
          errorMessage = err.message;
        }
      }

      const newFailureCount = failureCountRef.current + 1;
      setFailureCount(newFailureCount);
      setError(errorMessage);

      if (isTransientError(status, isNetworkError)) {
        // Transient error - apply backoff
        if (newFailureCount >= failureThreshold) {
          setPollingState('failed');
          setRetryInSeconds(null);
          // Stop automatic polling, user must manually retry
          if (timerRef.current) clearTimeout(timerRef.current);
          if (countdownRef.current) clearInterval(countdownRef.current);
        } else {
          setPollingState('degraded');
          const backoffInterval = calculateBackoff(baseInterval, maxBackoff, newFailureCount);
          scheduleNextPoll(backoffInterval);
        }
      } else {
        // Non-transient error (e.g., 404, 500) - show error but don't retry
        setPollingState('failed');
        setRetryInSeconds(null);
        if (timerRef.current) clearTimeout(timerRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    }
  }, [fetchFn, shouldStopPolling, baseInterval, maxBackoff, failureThreshold, scheduleNextPoll]);

  // Keep performFetchRef in sync with performFetch
  useEffect(() => {
    performFetchRef.current = performFetch;
  }, [performFetch]);

  // Manual retry function
  const retry = useCallback(() => {
    setIsPolling(true);
    setPollingState('normal');
    setFailureCount(0);
    setError(null);
    setRetryInSeconds(null);
    performFetch();
  }, [performFetch]);

  // Initial fetch and polling setup
  useEffect(() => {
    performFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data,
    pollingState,
    isPolling,
    failureCount,
    retryInSeconds,
    error,
    retry,
  };
}
