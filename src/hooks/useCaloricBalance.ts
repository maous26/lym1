'use client';

import { useMemo } from 'react';
import { useMealStore } from '@/store/meal-store';
import { useUserStore } from '@/store/user-store';
import { calculateCaloricBalance, getBalanceMessage, type CaloricBalanceData } from '@/lib/caloric-balance';

interface UseCaloricBalanceReturn extends CaloricBalanceData {
  message: {
    title: string;
    subtitle: string;
    ctaText: string;
  };
  dailyTarget: number;
  canUsePleasureCredit: boolean;
}

/**
 * Hook pour accéder aux données du Solde Calorique
 * Calcule automatiquement le solde basé sur les 7 derniers jours
 */
export function useCaloricBalance(): UseCaloricBalanceReturn {
  const meals = useMealStore((state) => state.meals);
  const soloNutritionalNeeds = useUserStore((state) => state.soloNutritionalNeeds);

  const dailyTarget = soloNutritionalNeeds?.calories || 2000;

  const balanceData = useMemo(() => {
    return calculateCaloricBalance(meals, dailyTarget);
  }, [meals, dailyTarget]);

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
  };
}

export default useCaloricBalance;
