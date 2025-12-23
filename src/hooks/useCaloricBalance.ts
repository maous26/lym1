'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import { useMealStore } from '@/store/meal-store';
import { useUserStore } from '@/store/user-store';
import { calculateCaloricBalance, getBalanceMessage, type CaloricBalanceData } from '@/lib/caloric-balance';

// Keys for localStorage
const RESET_DATE_KEY = 'caloric-balance-last-reset';
const REPORT_DAY_KEY = 'caloric-balance-report-day';
const RESET_COOLDOWN_DAYS = 7;

// Report day type
type ReportDay = 6 | 7;

interface UseCaloricBalanceReturn extends CaloricBalanceData {
  message: {
    title: string;
    subtitle: string;
    ctaText: string;
  };
  dailyTarget: number;
  canUsePleasureCredit: boolean;
  // Reset functionality
  lastResetDate: string | null;
  canReset: boolean;
  daysUntilReset: number;
  resetBalance: () => void;
  // Report day functionality
  reportDay: ReportDay;
  setReportDay: (day: ReportDay) => void;
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.floor(Math.abs((date2.getTime() - date1.getTime()) / oneDay));
}

/**
 * Hook pour accéder aux données du Solde Calorique
 * Calcule automatiquement le solde basé sur les 7 derniers jours
 * Inclut la fonctionnalité de réinitialisation (disponible tous les 7 jours)
 * Permet de choisir le jour de report du solde (J6 ou J7)
 */
export function useCaloricBalance(): UseCaloricBalanceReturn {
  const meals = useMealStore((state) => state.meals);
  const soloNutritionalNeeds = useUserStore((state) => state.soloNutritionalNeeds);

  // State for reset date (stored in localStorage)
  const [lastResetDate, setLastResetDate] = useState<string | null>(null);
  const [reportDay, setReportDayState] = useState<ReportDay>(7);
  const [isClient, setIsClient] = useState(false);

  // Initialize from localStorage on client
  useEffect(() => {
    setIsClient(true);
    const storedResetDate = localStorage.getItem(RESET_DATE_KEY);
    if (storedResetDate) {
      setLastResetDate(storedResetDate);
    }

    const storedReportDay = localStorage.getItem(REPORT_DAY_KEY);
    if (storedReportDay === '6' || storedReportDay === '7') {
      setReportDayState(parseInt(storedReportDay) as ReportDay);
    }
  }, []);

  const dailyTarget = soloNutritionalNeeds?.calories || 2000;

  // Set report day and save to localStorage
  const setReportDay = useCallback((day: ReportDay) => {
    setReportDayState(day);
    localStorage.setItem(REPORT_DAY_KEY, day.toString());
  }, []);

  // Calculate if reset is available
  const { canReset, daysUntilReset } = useMemo(() => {
    if (!lastResetDate) {
      return { canReset: true, daysUntilReset: 0 };
    }

    const lastReset = new Date(lastResetDate);
    const today = new Date();
    const daysSinceReset = daysBetween(lastReset, today);

    if (daysSinceReset >= RESET_COOLDOWN_DAYS) {
      return { canReset: true, daysUntilReset: 0 };
    }

    return {
      canReset: false,
      daysUntilReset: RESET_COOLDOWN_DAYS - daysSinceReset,
    };
  }, [lastResetDate]);

  // Reset function - clears meals from the past 7 days to recalculate balance
  const resetBalance = useCallback(() => {
    if (!canReset) return;

    const today = new Date().toISOString().split('T')[0];

    // Save reset date to localStorage
    localStorage.setItem(RESET_DATE_KEY, today);
    setLastResetDate(today);

    // Note: We don't actually delete the meals, we just mark the reset date
    // The balance calculation will start fresh from today
    console.log('Balance reset! Next reset available in 7 days.');
  }, [canReset]);

  const balanceData = useMemo(() => {
    // If there's a reset date, we calculate balance only from meals after that date
    const effectiveMeals = lastResetDate
      ? Object.fromEntries(
          Object.entries(meals).filter(([date]) => date >= lastResetDate)
        )
      : meals;

    return calculateCaloricBalance(effectiveMeals, dailyTarget);
  }, [meals, dailyTarget, lastResetDate]);

  const message = useMemo(() => {
    return getBalanceMessage(
      balanceData.availableBalance,
      balanceData.projectedJ7Impact
    );
  }, [balanceData.availableBalance, balanceData.projectedJ7Impact]);

  // On peut utiliser le crédit plaisir si on a au moins 200 kcal disponibles
  const canUsePleasureCredit = balanceData.availableBalance >= 200;

  return {
    ...balanceData,
    message,
    dailyTarget,
    canUsePleasureCredit,
    // Reset functionality
    lastResetDate,
    canReset: isClient ? canReset : false, // Only enable on client
    daysUntilReset,
    resetBalance,
    // Report day functionality
    reportDay,
    setReportDay,
  };
}

export default useCaloricBalance;
