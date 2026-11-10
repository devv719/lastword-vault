import { useState, useEffect } from 'react';
import type { VaultState } from '../types';

export interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
  percentage: number;
  state: VaultState;
  stateColor: string;
  stateBadgeBg: string;
}

export function useCountdown(
  initialSecondsRemaining: number,
  totalSecondsInInterval: number
): CountdownResult {
  const [secondsLeft, setSecondsLeft] = useState<number>(initialSecondsRemaining);

  useEffect(() => {
    setSecondsLeft(initialSecondsRemaining);
  }, [initialSecondsRemaining]);

  useEffect(() => {
    if (secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  const days = Math.floor(secondsLeft / 86400);
  const hours = Math.floor((secondsLeft % 86400) / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;

  const total = Math.max(1, totalSecondsInInterval);
  const percentage = Math.min(100, Math.max(0, Math.round((secondsLeft / total) * 100)));

  // Determine state based on time remaining ratio
  let state: VaultState = 'active';
  let stateColor = '#3D5A8A'; // calm blue
  let stateBadgeBg = '#E8EEF7';

  if (secondsLeft === 0) {
    state = 'grace';
    stateColor = '#B4423A'; // red
    stateBadgeBg = '#FDF2F1';
  } else if (percentage < 25) {
    state = 'warning';
    stateColor = '#B7791F'; // amber
    stateBadgeBg = '#FEF7EE';
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatted = `${days > 0 ? `${days}d ` : ''}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return {
    days,
    hours,
    minutes,
    seconds,
    formatted,
    percentage,
    state,
    stateColor,
    stateBadgeBg,
  };
}
