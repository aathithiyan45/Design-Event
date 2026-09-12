import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'design_event_arrow_quota';
const MAX_ARROW_PRESSES = 50;
const COOLDOWN_DURATION_MS = 30000; // 30 seconds

const getInitialQuota = () => {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const count = typeof parsed.count === 'number' ? parsed.count : 0;
      const cooldownEndTime = typeof parsed.cooldownEndTime === 'number' ? parsed.cooldownEndTime : 0;
      return { count, cooldownEndTime };
    }
  } catch (e) {
    console.error('Failed to read arrow quota from sessionStorage:', e);
  }
  return { count: 0, cooldownEndTime: 0 };
};

export function useArrowQuota() {
  const [quotaState, setQuotaState] = useState(getInitialQuota);

  // Sync state to sessionStorage whenever it changes
  const updateQuotaState = useCallback((newStateOrUpdater) => {
    setQuotaState(prev => {
      const nextState = typeof newStateOrUpdater === 'function' ? newStateOrUpdater(prev) : newStateOrUpdater;
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      } catch (e) {
        console.error('Failed to save arrow quota to sessionStorage:', e);
      }
      return nextState;
    });
  }, []);

  // Timer interval to tick remaining seconds and handle cooldown expiration
  useEffect(() => {
    const checkCooldownExpiration = () => {
      const { count, cooldownEndTime } = getInitialQuota();
      const now = Date.now();

      if (cooldownEndTime > 0 && now >= cooldownEndTime) {
        // Cooldown has completed! Reset count and cooldown
        updateQuotaState({ count: 0, cooldownEndTime: 0 });
      } else if (cooldownEndTime > 0) {
        setQuotaState({ count, cooldownEndTime });
      }
    };

    checkCooldownExpiration();
    const interval = setInterval(checkCooldownExpiration, 1000);
    return () => clearInterval(interval);
  }, [updateQuotaState]);

  const now = Date.now();
  const isCooldownActive = quotaState.cooldownEndTime > 0 && now < quotaState.cooldownEndTime;
  const remainingSeconds = isCooldownActive
    ? Math.max(1, Math.ceil((quotaState.cooldownEndTime - now) / 1000))
    : 0;

  /**
   * Consume 1 change from the quota.
   * Returns true if allowed, false if blocked (in cooldown or max changes reached).
   */
  const consumeQuotaChange = useCallback(() => {
    const now = Date.now();
    const saved = getInitialQuota();
    let { count, cooldownEndTime } = saved;

    // 1. If currently in active cooldown
    if (cooldownEndTime > 0) {
      if (now < cooldownEndTime) {
        return false;
      }
      // Cooldown expired, reset
      count = 0;
      cooldownEndTime = 0;
    }

    // 2. If count has reached limit (50 changes)
    if (count >= MAX_ARROW_PRESSES) {
      const newEndTime = now + COOLDOWN_DURATION_MS;
      updateQuotaState({ count: MAX_ARROW_PRESSES, cooldownEndTime: newEndTime });
      return false;
    }

    // 3. Allowed: consume 1 change
    const nextCount = count + 1;
    const nextCooldownEndTime = nextCount >= MAX_ARROW_PRESSES ? now + COOLDOWN_DURATION_MS : 0;

    updateQuotaState({
      count: nextCount,
      cooldownEndTime: nextCooldownEndTime,
    });

    return true;
  }, [updateQuotaState]);

  /**
   * Attempt to consume an ArrowUp (+1) or ArrowDown (-1) keypress.
   * Returns { allowed: boolean, newValue: number }
   */
  const tryConsumeArrow = useCallback((currentVal, min, max, isUp) => {
    const allowed = consumeQuotaChange();
    if (!allowed) {
      return { allowed: false, newValue: currentVal };
    }

    const delta = isUp ? 1 : -1;
    const currentNum = typeof currentVal === 'number' && Number.isFinite(currentVal) ? currentVal : min;
    const computedVal = currentNum + delta;
    const newValue = Math.max(min, Math.min(max, computedVal));

    return { allowed: true, newValue };
  }, [consumeQuotaChange]);

  return {
    count: quotaState.count,
    maxCount: MAX_ARROW_PRESSES,
    isCooldownActive,
    remainingSeconds,
    consumeQuotaChange,
    tryConsumeArrow,
  };
}
