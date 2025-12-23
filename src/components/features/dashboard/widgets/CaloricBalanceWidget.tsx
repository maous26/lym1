'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  ChevronRight,
  Flame,
  Target,
  Info,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import type { DailyBalance } from '@/lib/caloric-balance';

// Plafond maximum du solde calorique (environ 0.5kg de graisse = 3850 kcal)
// On limite à 3500 kcal pour éviter les excès lors de l'utilisation
const MAX_CALORIC_BALANCE = 3500;

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
}

// Daily bar component showing consumption vs target
function DailyBar({
  day,
  index,
  target,
  isToday,
}: {
  day: DailyBalance;
  index: number;
  target: number;
  isToday: boolean;
}) {
  const consumed = day.consumed;
  const percentage = target > 0 ? (consumed / target) * 100 : 0;
  const isOver = consumed > target;
  const isUnder = consumed < target && consumed > 0;
  const isEmpty = consumed === 0;

  // Calculate bar height (max 100% = target, can go above)
  const barHeight = Math.min(percentage, 150); // Cap at 150% for display
  const overflowHeight = percentage > 100 ? Math.min(percentage - 100, 50) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex flex-col items-center gap-1 flex-1"
    >
      {/* Bar container */}
      <div className="relative w-full h-24 flex flex-col justify-end items-center">
        {/* Target line */}
        <div className="absolute bottom-[64px] left-0 right-0 h-[2px] bg-gray-300 z-10">
          <div className="absolute -right-1 -top-[3px] w-2 h-2 bg-gray-400 rounded-full" />
        </div>

        {/* Bar */}
        <div className="relative w-6 flex flex-col justify-end items-center">
          {/* Overflow section (above target) */}
          {overflowHeight > 0 && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${overflowHeight * 0.64}px` }}
              transition={{ duration: 0.5, delay: index * 0.05 + 0.3 }}
              className="w-full bg-gradient-to-t from-red-400 to-red-500 rounded-t-md"
            />
          )}

          {/* Main bar */}
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: isEmpty ? 4 : `${Math.min(barHeight, 100) * 0.64}px` }}
            transition={{ duration: 0.5, delay: index * 0.05 }}
            className={cn(
              'w-full rounded-md',
              isEmpty && 'bg-gray-200',
              isUnder && 'bg-gradient-to-t from-emerald-400 to-emerald-500',
              isOver && !isEmpty && 'bg-gradient-to-t from-amber-400 to-amber-500',
              consumed === target && 'bg-gradient-to-t from-blue-400 to-blue-500',
              isToday && 'ring-2 ring-offset-1 ring-blue-400'
            )}
          />
        </div>

        {/* Consumption indicator */}
        {!isEmpty && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 + 0.5 }}
            className={cn(
              'absolute -top-1 text-[9px] font-bold px-1 rounded',
              isOver ? 'text-red-600' : 'text-emerald-600'
            )}
            style={{ bottom: `${Math.min(barHeight, 100) * 0.64 + (overflowHeight * 0.64) + 4}px` }}
          >
            {isOver ? `+${Math.round(consumed - target)}` : `-${Math.round(target - consumed)}`}
          </motion.div>
        )}
      </div>

      {/* Day label */}
      <span className={cn(
        'text-[10px] font-medium',
        isToday ? 'text-blue-600 font-bold' : 'text-gray-500'
      )}>
        {day.dayLabel}
      </span>
    </motion.div>
  );
}

// Total balance display with cap
function TotalBalanceDisplay({
  balance,
  maxBalance,
}: {
  balance: number;
  maxBalance: number;
}) {
  const cappedBalance = Math.min(balance, maxBalance);
  const isAtMax = balance >= maxBalance;
  const percentage = (cappedBalance / maxBalance) * 100;

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-4 text-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          <span className="text-sm font-medium text-gray-300">Solde total</span>
        </div>
        {isAtMax && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 rounded-full">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] text-amber-400 font-medium">MAX</span>
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 mb-3">
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-4xl font-bold"
        >
          {cappedBalance.toLocaleString('fr-FR')}
        </motion.span>
        <span className="text-gray-400 text-sm mb-1">/ {maxBalance.toLocaleString('fr-FR')} kcal</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className={cn(
            'h-full rounded-full',
            isAtMax
              ? 'bg-gradient-to-r from-amber-400 to-yellow-400'
              : 'bg-gradient-to-r from-emerald-400 to-teal-400'
          )}
        />
      </div>

      {isAtMax && (
        <p className="text-[10px] text-amber-400 mt-2">
          Solde plafonné pour éviter les excès. Utilise-le !
        </p>
      )}
    </div>
  );
}

// Impact badge component
function ImpactBadge({
  impact,
  weightChange,
}: {
  impact: 'positive' | 'neutral' | 'negative';
  weightChange: number;
}) {
  const config = {
    positive: {
      icon: TrendingDown,
      label: 'Perte estimée',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
    },
    neutral: {
      icon: Minus,
      label: 'Stable',
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      border: 'border-gray-200',
    },
    negative: {
      icon: TrendingUp,
      label: 'Gain estimé',
      color: 'text-red-500',
      bg: 'bg-red-50',
      border: 'border-red-200',
    },
  };

  const { icon: Icon, label, color, bg, border } = config[impact];
  const displayWeight = Math.abs(weightChange);

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full border',
        bg,
        border
      )}
    >
      <Icon className={cn('w-4 h-4', color)} />
      <span className={cn('text-xs font-medium', color)}>
        {impact === 'neutral' ? label : `${label}: ${displayWeight}g/sem`}
      </span>
    </div>
  );
}

// Stat card component
function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  unit: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-900">
          {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
          <span className="text-xs font-normal text-gray-500 ml-1">{unit}</span>
        </p>
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
}: CaloricBalanceWidgetProps) {
  const router = useRouter();
  const [showDetails, setShowDetails] = useState(false);

  // Cap the balance at MAX_CALORIC_BALANCE
  const cappedBalance = Math.min(availableBalance, MAX_CALORIC_BALANCE);

  const handleUsePleasureCredit = () => {
    router.push('/meals/add?tab=ai&mode=pleasure');
  };

  // Find today's index in the history
  const todayIndex = weeklyHistory.length - 1;

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
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Solde calorique</h3>
              <p className="text-sm text-gray-500">Suivi hebdomadaire</p>
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

      {/* Weekly bars chart */}
      <div className="px-5 pb-4">
        <div className="bg-gray-50 rounded-2xl p-4">
          {/* Legend */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-gray-500">Sous seuil</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-gray-500">Au-dessus</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <div className="w-4 h-[2px] bg-gray-400" />
              <span>Seuil: {todayTarget} kcal</span>
            </div>
          </div>

          {/* Bars */}
          <div className="flex items-end gap-1">
            {weeklyHistory.map((day, index) => (
              <DailyBar
                key={day.date}
                day={day}
                index={index}
                target={todayTarget}
                isToday={index === todayIndex}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Total balance display */}
      <div className="px-5 pb-4">
        <TotalBalanceDisplay balance={availableBalance} maxBalance={MAX_CALORIC_BALANCE} />
      </div>

      {/* Impact badge */}
      <div className="px-5 pb-3 flex justify-center">
        <ImpactBadge impact={projectedJ7Impact} weightChange={projectedWeightChange} />
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
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={Target}
                  label="Objectif quotidien"
                  value={todayTarget}
                  unit="kcal"
                  color="bg-gradient-to-br from-blue-400 to-blue-600"
                />
                <StatCard
                  icon={Flame}
                  label="Consommé aujourd'hui"
                  value={todayConsumed}
                  unit="kcal"
                  color="bg-gradient-to-br from-orange-400 to-orange-600"
                />
              </div>

              <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-800">
                  <strong>Comment ça marche ?</strong> Les barres montrent ta consommation quotidienne
                  par rapport à ton seuil. En vert = sous le seuil (tu économises). En rouge = au-dessus.
                  Le solde est plafonné à {MAX_CALORIC_BALANCE.toLocaleString('fr-FR')} kcal pour éviter les excès.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
