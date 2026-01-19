'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface PollingState {
  isReconnecting: boolean;
  isFailed: boolean;
  failureCount: number;
  nextRetryIn: number | null;
}

export interface UsePollingWithBackoffOptions<T> {
  fetchFn: () => Promise<Response>;
  onSuccess: (data: T) => void;
  onPermanentError?: (error: string) => void;
  isTerminal?: (data: T) => boolean;
  normalInterval?: number;
  maxFailures?: number;
}

interface BackoffConfig {
  baseDelay: number;
  maxDelay: number;
  multiplier: number;
}

const DEFAULT_BACKOFF: BackoffConfig = {
  baseDelay: 2000,
  maxDelay: 60000,
  multiplier: 2,
};

const TRANSIENT_STATUS_CODES = [429, 502, 503, 504];
const PERMANENT_STATUS_CODES = [404];

function isTransientError(status: number): boolean {
  return TRANSIENT_STATUS_CODES.includes(status);
}

function isPermanentError(status: number): boolean {
  return PERMANENT_STATUS_CODES.includes(status);
}

function calculateBackoffDelay(failureCount: number, config: BackoffConfig): number {
  const delay = config.baseDelay * Math.pow(config.multiplier, failureCount - 1);
  return Math.min(delay, config.maxDelay);
}

export function usePollingWithBackoff<T>({
  fetchFn,
  onSuccess,
  onPermanentError,
  isTerminal,
  normalInterval = 15000,
  maxFailures = 5,
}: UsePollingWithBackoffOptions<T>) {
  const [pollingState, setPollingState] = useState<PollingState>({
    isReconnecting: false,
    isFailed: false,
    failureCount: 0,
    nextRetryIn: null,
  });
  const [isPolling, setIsPolling] = useState(true);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const pollRef = useRef<() => void>(() => {});

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const scheduleNextPoll = useCallback((delay: number, isBackoff: boolean = false) => {
    clearTimers();
    
    if (isBackoff) {
      const startTime = Date.now();
      const endTime = startTime + delay;
      
      setPollingState(prev => ({
        ...prev,
        nextRetryIn: Math.ceil(delay / 1000),
      }));
      
      countdownRef.current = setInterval(() => {
        if (!isMountedRef.current) return;
        const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        setPollingState(prev => ({
          ...prev,
          nextRetryIn: remaining,
        }));
        if (remaining <= 0 && countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      }, 1000);
    }
    
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        pollRef.current();
      }
    }, delay);
  }, [clearTimers]);

  const poll = useCallback(async () => {
    if (!isMountedRef.current || !isPolling) return;

    try {
      const response = await fetchFn();
      const status = response.status;
      
      if (!response.ok) {
        if (isPermanentError(status)) {
          setPollingState({
            isReconnecting: false,
            isFailed: true,
            failureCount: maxFailures,
            nextRetryIn: null,
          });
          setIsPolling(false);
          
          let errorMessage = 'Request failed';
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            // Ignore JSON parse errors
          }
          onPermanentError?.(errorMessage);
          return;
        }
        
        if (isTransientError(status)) {
          const newFailureCount = pollingState.failureCount + 1;
          
          if (newFailureCount >= maxFailures) {
            setPollingState({
              isReconnecting: false,
              isFailed: true,
              failureCount: newFailureCount,
              nextRetryIn: null,
            });
            setIsPolling(false);
            return;
          }
          
          const backoffDelay = calculateBackoffDelay(newFailureCount, DEFAULT_BACKOFF);
          setPollingState({
            isReconnecting: true,
            isFailed: false,
            failureCount: newFailureCount,
            nextRetryIn: Math.ceil(backoffDelay / 1000),
          });
          scheduleNextPoll(backoffDelay, true);
          return;
        }
        
        throw new Error(`HTTP error: ${status}`);
      }
      
      const data: T = await response.json();
      
      setPollingState({
        isReconnecting: false,
        isFailed: false,
        failureCount: 0,
        nextRetryIn: null,
      });
      
      onSuccess(data);
      
      if (isTerminal?.(data)) {
        setIsPolling(false);
        return;
      }
      
      scheduleNextPoll(normalInterval, false);
      
    } catch {
      const newFailureCount = pollingState.failureCount + 1;
      
      if (newFailureCount >= maxFailures) {
        setPollingState({
          isReconnecting: false,
          isFailed: true,
          failureCount: newFailureCount,
          nextRetryIn: null,
        });
        setIsPolling(false);
        return;
      }
      
      const backoffDelay = calculateBackoffDelay(newFailureCount, DEFAULT_BACKOFF);
      setPollingState({
        isReconnecting: true,
        isFailed: false,
        failureCount: newFailureCount,
        nextRetryIn: Math.ceil(backoffDelay / 1000),
      });
      scheduleNextPoll(backoffDelay, true);
    }
  }, [fetchFn, onSuccess, onPermanentError, isTerminal, normalInterval, maxFailures, pollingState.failureCount, scheduleNextPoll, isPolling]);

  // Keep pollRef updated with the latest poll function
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const retry = useCallback(() => {
    setPollingState({
      isReconnecting: false,
      isFailed: false,
      failureCount: 0,
      nextRetryIn: null,
    });
    setIsPolling(true);
    pollRef.current();
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    pollRef.current();
    
    return () => {
      isMountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  return {
    pollingState,
    isPolling,
    retry,
  };
}
