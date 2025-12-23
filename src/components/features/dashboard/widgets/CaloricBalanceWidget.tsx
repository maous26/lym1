'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
  ChevronRight,
  Target,
  Info,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import type { DailyBalance } from '@/lib/caloric-balance';

// Seuils basés sur les recommandations médicales (CDC, NHS, études cliniques)
// Perte de poids saine : 0.5-1 kg/semaine (500-1000g)
// Trop rapide : >1 kg/semaine (risque de perte musculaire, carences, effet yo-yo)
// Trop lent : <250g/semaine (peut indiquer plateau ou besoin d'ajustement)
const WEIGHT_LOSS_THRESHOLDS = {
  tooFast: 1000,      // > 1kg/sem = trop rapide
  healthyMax: 1000,   // 1kg/sem = limite haute saine
  healthyMin: 250,    // 250g/sem = limite basse pour progrès visible
  tooSlow: 250,       // < 250g/sem = trop lent (si objectif perte)
};

interface CaloricBalanceWidgetProps {
  availableBalance: number;
  weeklyHistory: DailyBalance[];
  projectedJ7Impact: 'positive' | 'neutral' | 'negative';
  projectedWeightChange: number;
  todayBalance: number;
  todayTarget: number;
  todayConsumed: number;
  canUsePleasureCredit: boolean;
  message: {
    title: string;
    subtitle: string;
    ctaText: string;
  };
  className?: string;
  lastResetDate?: string | null;
  onReset?: () => void;
  canReset?: boolean;
  daysUntilReset?: number;
  reportDay?: 6 | 7;
  onReportDayChange?: (day: 6 | 7) => void;
}

// Daily bar component - Style like the provided image
function DailyBar({
  day,
  index,
  target,
  isToday,
  isLastDay,
  cumulativeBalance,
  maxHeight = 80,
}: {
  day: DailyBalance;
  index: number;
  target: number;
  isToday: boolean;
  isLastDay: boolean;
  cumulativeBalance: number;
  maxHeight?: number;
}) {
  const consumed = day.consumed;
  const percentage = target > 0 ? (consumed / target) * 100 : 0;
  const isOver = consumed > target;
  const isEmpty = consumed === 0;

  // Bar height calculation - target line is at ~80% of maxHeight
  const targetLinePosition = maxHeight * 0.8;
  const barHeight = isEmpty ? 4 : Math.min((percentage / 100) * targetLinePosition, maxHeight);

  // Overflow part (above target)
  const overflowHeight = percentage > 100
    ? Math.min(((percentage - 100) / 100) * targetLinePosition, maxHeight - targetLinePosition)
    : 0;

  // Daily balance (difference from target)
  const dailyBalance = day.balance;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex flex-col items-center gap-1 flex-1 relative"
    >
      {/* Calories consumed label above bar (not on last day if showing balance) */}
      {!isEmpty && !(isLastDay && cumulativeBalance !== 0) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.05 + 0.3 }}
          className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-medium text-gray-500 whitespace-nowrap"
        >
          {consumed}
        </motion.div>
      )}

      {/* Cumulative balance label on last day (J7) */}
      {isLastDay && cumulativeBalance !== 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className={cn(
            'absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-bold whitespace-nowrap z-20',
            cumulativeBalance > 0 ? 'text-blue-600' : 'text-orange-600'
          )}
        >
          {cumulativeBalance > 0 ? '+' : ''}{cumulativeBalance.toLocaleString('fr-FR')}
        </motion.div>
      )}

      {/* Bar container */}
      <div
        className="relative w-full flex flex-col justify-end items-center"
        style={{ height: `${maxHeight}px` }}
      >
        {/* Target line (seuil) - not shown on last day balance bar */}
        {!isLastDay && (
          <div
            className="absolute left-0 right-0 h-[2px] bg-blue-400 z-10"
            style={{ bottom: `${targetLinePosition}px` }}
          />
        )}

        {/* Bar */}
        <div className="relative w-8 flex flex-col justify-end items-center">
          {isLastDay ? (
            /* Last day: show theoretical target + balance adjustment */
            <>
              {/* Balance bar above/below target */}
              {cumulativeBalance > 0 && (
                /* Positive balance: Blue bar ABOVE the green target bar */
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.min(Math.abs(cumulativeBalance) / target * targetLinePosition * 0.5, maxHeight - targetLinePosition)}px` }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="w-full bg-gradient-to-t from-blue-400 to-blue-500 rounded-t-sm"
                  style={{ position: 'relative', zIndex: 5 }}
                />
              )}

              {/* Green bar at target level (theoretical 2000 kcal) */}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${cumulativeBalance < 0
                  ? Math.max(targetLinePosition - Math.abs(cumulativeBalance) / target * targetLinePosition * 0.5, targetLinePosition * 0.3)
                  : targetLinePosition}px` }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="w-full bg-gradient-to-t from-emerald-400 to-emerald-500 rounded-sm"
              />

              {/* Negative balance: Orange section eating into the green */}
              {cumulativeBalance < 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="absolute w-full bg-gradient-to-t from-orange-400 to-orange-500 rounded-t-sm"
                  style={{
                    height: `${Math.min(Math.abs(cumulativeBalance) / target * targetLinePosition * 0.5, targetLinePosition * 0.7)}px`,
                    bottom: `${Math.max(targetLinePosition - Math.abs(cumulativeBalance) / target * targetLinePosition * 0.5, targetLinePosition * 0.3)}px`,
                  }}
                />
              )}
            </>
          ) : (
            <>
              {/* Overflow section (above target) - Orange/Red */}
              {overflowHeight > 0 && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${overflowHeight}px` }}
                  transition={{ duration: 0.5, delay: index * 0.05 + 0.3 }}
                  className="w-full bg-gradient-to-t from-orange-400 to-orange-500 rounded-t-sm"
                  style={{ marginBottom: `-${overflowHeight}px`, position: 'relative', zIndex: 5 }}
                />
              )}

              {/* Main bar - Green */}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.min(barHeight, targetLinePosition)}px` }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className={cn(
                  'w-full rounded-sm',
                  isEmpty ? 'bg-gray-200' : 'bg-gradient-to-t from-emerald-400 to-emerald-500',
                  isToday && 'ring-2 ring-offset-1 ring-blue-500'
                )}
              />
            </>
          )}
        </div>

        {/* Over target indicator - Blue bar on top */}
        {isOver && !isLastDay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.05 + 0.5 }}
            className="absolute w-8 bg-blue-500 rounded-t-sm"
            style={{
              bottom: `${targetLinePosition}px`,
              height: `${overflowHeight}px`
            }}
          />
        )}
      </div>

      {/* Day label - Using actual day names from weeklyHistory */}
      <span className={cn(
        'text-[10px] font-medium',
        isToday ? 'text-blue-600 font-bold' : 'text-gray-500',
        isLastDay && !isToday && (cumulativeBalance > 0 ? 'text-blue-600 font-bold' : 'text-orange-600 font-bold')
      )}>
        {isLastDay ? 'Solde' : day.dayLabel}
      </span>
    </motion.div>
  );
}

// Weight loss alert component
function WeightLossAlert({
  weightChange,
  impact,
}: {
  weightChange: number;
  impact: 'positive' | 'neutral' | 'negative';
}) {
  const absChange = Math.abs(weightChange);

  // Determine alert type based on medical guidelines
  let alertType: 'success' | 'warning' | 'danger' | 'info' = 'info';
  let alertMessage = '';
  let alertIcon = Minus;

  if (impact === 'positive') {
    // User is in caloric deficit (losing weight)
    if (absChange > WEIGHT_LOSS_THRESHOLDS.tooFast) {
      alertType = 'danger';
      alertMessage = 'Perte trop rapide ! Risque de perte musculaire et effet yo-yo. Augmente légèrement tes calories.';
      alertIcon = AlertTriangle;
    } else if (absChange >= WEIGHT_LOSS_THRESHOLDS.healthyMin && absChange <= WEIGHT_LOSS_THRESHOLDS.healthyMax) {
      alertType = 'success';
      alertMessage = 'Rythme de perte idéal. Continue comme ça !';
      alertIcon = CheckCircle2;
    } else if (absChange < WEIGHT_LOSS_THRESHOLDS.tooSlow && absChange > 0) {
      alertType = 'warning';
      alertMessage = 'Perte très lente. Tu peux réduire légèrement tes calories ou augmenter ton activité.';
      alertIcon = AlertTriangle;
    }
  } else if (impact === 'negative') {
    // User is in caloric surplus (gaining weight)
    if (absChange > WEIGHT_LOSS_THRESHOLDS.tooFast) {
      alertType = 'danger';
      alertMessage = 'Prise de poids rapide détectée. Attention à ta consommation calorique.';
      alertIcon = AlertTriangle;
    } else if (absChange > 0) {
      alertType = 'warning';
      alertMessage = 'Tu es en surplus calorique. Ajuste ton alimentation si ton objectif est de perdre du poids.';
      alertIcon = AlertTriangle;
    }
  }

  if (!alertMessage) return null;

  const alertStyles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    danger: 'bg-red-50 border-red-200 text-red-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
  };

  const IconComponent = alertIcon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex items-start gap-2 p-3 rounded-xl border text-xs',
        alertStyles[alertType]
      )}
    >
      <IconComponent className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{alertMessage}</span>
    </motion.div>
  );
}

// Estimated weight change display
function EstimatedWeightChange({
  weightChange,
  impact,
}: {
  weightChange: number;
  impact: 'positive' | 'neutral' | 'negative';
}) {
  const absChange = Math.abs(weightChange);
  const displayChange = absChange >= 1000
    ? `${(absChange / 1000).toFixed(1)} kg`
    : `${absChange} g`;

  const config = {
    positive: {
      icon: TrendingDown,
      label: 'Perte estimée',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      iconColor: 'text-emerald-500',
    },
    neutral: {
      icon: Minus,
      label: 'Stable',
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      iconColor: 'text-gray-500',
    },
    negative: {
      icon: TrendingUp,
      label: 'Prise estimée',
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
      iconColor: 'text-red-500',
    },
  };

  const { icon: Icon, label, color, bg, border, iconColor } = config[impact];

  return (
    <div className={cn(
      'flex items-center justify-between p-4 rounded-2xl border',
      bg, border
    )}>
      <div className="flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', bg)}>
          <Icon className={cn('w-5 h-5', iconColor)} />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label} cette semaine</p>
          <p className={cn('text-xl font-bold', color)}>
            {impact === 'neutral' ? '—' : displayChange}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[10px] text-gray-400">Objectif sain</p>
        <p className="text-xs font-medium text-gray-600">0.5-1 kg/sem</p>
      </div>
    </div>
  );
}

export function CaloricBalanceWidget({
  availableBalance,
  weeklyHistory,
  projectedJ7Impact,
  projectedWeightChange,
  todayBalance,
  todayTarget,
  todayConsumed,
  canUsePleasureCredit,
  message,
  className,
  lastResetDate,
  onReset,
  canReset,
  daysUntilReset,
}: CaloricBalanceWidgetProps) {
  const router = useRouter();
  const [showDetails, setShowDetails] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleUsePleasureCredit = () => {
    router.push('/meals/add?tab=ai&mode=pleasure');
  };

  const handleReset = () => {
    if (onReset && canReset) {
      onReset();
      setShowResetConfirm(false);
    }
  };

  // Find today's index in the history (first entry is today - index 0)
  const todayIndex = 0;

  // Last day index (J7) for showing cumulative balance (index 6)
  const lastDayIndex = weeklyHistory.length - 1;

  // Calculate cumulative balance (sum of all daily balances)
  // Capped at 3500 kcal max for positive balance
  const MAX_POSITIVE_BALANCE = 3500;
  const rawCumulativeBalance = weeklyHistory.reduce((sum, day) => {
    // Only count days with data
    if (day.consumed > 0) {
      return sum + day.balance;
    }
    return sum;
  }, 0);
  const cumulativeBalance = rawCumulativeBalance > 0
    ? Math.min(rawCumulativeBalance, MAX_POSITIVE_BALANCE)
    : rawCumulativeBalance;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-3xl overflow-hidden',
        'bg-gradient-to-br from-white via-gray-50 to-emerald-50/30',
        'border border-gray-100',
        'shadow-xl shadow-gray-200/50',
        className
      )}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Solde calorique</h3>
              <p className="text-sm text-gray-500">Suivi sur 7 jours</p>
            </div>
          </div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <Info className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Chart section */}
      <div className="px-5 pb-4">
        <div className="bg-white rounded-2xl p-4 pt-12 border border-gray-100">
          {/* Legend */}
          <div className="flex items-center justify-start mb-4">
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Seuil</span>
              <span className="text-xs font-bold text-gray-700">{todayTarget.toLocaleString('fr-FR')} KCAL</span>
            </div>
          </div>

          {/* Bars chart */}
          <div className="flex items-end gap-2 px-2">
            {weeklyHistory.map((day, index) => (
              <DailyBar
                key={day.date}
                day={day}
                index={index}
                target={todayTarget}
                isToday={index === todayIndex}
                isLastDay={index === lastDayIndex}
                cumulativeBalance={cumulativeBalance}
              />
            ))}
          </div>

          {/* Target line label */}
          <div className="flex items-center justify-end mt-2">
            <div className="flex items-center gap-1 text-[10px] text-blue-500">
              <div className="w-3 h-[2px] bg-blue-400" />
              <span>Seuil quotidien</span>
            </div>
          </div>
        </div>
      </div>

      {/* Estimated weight change */}
      <div className="px-5 pb-4">
        <EstimatedWeightChange
          weightChange={projectedWeightChange}
          impact={projectedJ7Impact}
        />
      </div>

      {/* Weight loss alert */}
      <div className="px-5 pb-4">
        <WeightLossAlert
          weightChange={projectedWeightChange}
          impact={projectedJ7Impact}
        />
      </div>

      {/* Details panel */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 pt-2 border-t border-gray-100">
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-800 mb-2">
                  <strong>Recommandations médicales (CDC, NHS) :</strong>
                </p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• <strong>Perte saine :</strong> 0.5 à 1 kg par semaine</li>
                  <li>• <strong>Trop rapide (&gt;1 kg/sem) :</strong> Risque de perte musculaire, carences, effet yo-yo</li>
                  <li>• <strong>Trop lent (&lt;250g/sem) :</strong> Peut nécessiter un ajustement du déficit</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Balance Section */}
      <div className="px-5 pb-4">
        <AnimatePresence mode="wait">
          {showResetConfirm ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-4 bg-amber-50 rounded-2xl border border-amber-200"
            >
              <p className="text-sm text-amber-800 mb-3">
                Réinitialiser le solde ? Aujourd'hui deviendra le jour 1 de ta nouvelle semaine.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2 px-4 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 py-2 px-4 rounded-xl bg-amber-500 text-white text-sm font-medium"
                >
                  Confirmer
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => canReset && setShowResetConfirm(true)}
              disabled={!canReset}
              className={cn(
                'w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors',
                canReset
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              )}
            >
              <RotateCcw className="w-4 h-4" />
              {canReset ? (
                'Réinitialiser le solde'
              ) : (
                `Disponible dans ${daysUntilReset} jour${daysUntilReset && daysUntilReset > 1 ? 's' : ''}`
              )}
            </motion.button>
          )}
        </AnimatePresence>
        {lastResetDate && (
          <p className="text-center text-[10px] text-gray-400 mt-2">
            Dernier reset : {new Date(lastResetDate).toLocaleDateString('fr-FR')}
          </p>
        )}
      </div>

      {/* CTA Button */}
      <div className="px-5 pb-5">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleUsePleasureCredit}
          disabled={!canUsePleasureCredit}
          className={cn(
            'w-full py-4 px-6 rounded-2xl font-semibold text-base',
            'flex items-center justify-center gap-2',
            'transition-all duration-300',
            canUsePleasureCredit
              ? 'bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          )}
        >
          <Sparkles className={cn('w-5 h-5', canUsePleasureCredit && 'animate-pulse')} />
          <span>{message.ctaText}</span>
          {canUsePleasureCredit && <ChevronRight className="w-5 h-5" />}
        </motion.button>

        {!canUsePleasureCredit && (
          <p className="text-center text-xs text-gray-500 mt-2">
            Économise au moins 200 kcal pour débloquer ton crédit plaisir
          </p>
        )}
      </div>
    </motion.div>
  );
}

export default CaloricBalanceWidget;
