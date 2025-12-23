'use client';

import { useState, useMemo } from 'react';
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
  Calendar,
  Info,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
} from 'recharts';
import type { DailyBalance } from '@/lib/caloric-balance';

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

// Animated gauge component
function AnimatedGauge({
  value,
  max,
  size = 140,
  strokeWidth = 12,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * Math.PI * 1.5; // 270 degrees arc
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const offset = circumference - (percentage / 100) * circumference;

  // Color based on percentage
  const getGradientColors = () => {
    if (percentage >= 50) return { start: '#10b981', end: '#059669' }; // Emerald
    if (percentage >= 25) return { start: '#f59e0b', end: '#d97706' }; // Amber
    return { start: '#ef4444', end: '#dc2626' }; // Red
  };

  const colors = getGradientColors();

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform rotate-[135deg]"
      >
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colors.start} />
            <stop offset="100%" stopColor={colors.end} />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference * 0.33}`}
        />

        {/* Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference * 0.33}`}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          filter="url(#glow)"
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, type: 'spring' }}
          className="text-center"
        >
          <div className="flex items-baseline justify-center gap-0.5">
            <span className="text-3xl font-bold text-gray-900">
              {Math.abs(value).toLocaleString('fr-FR')}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            calories
          </span>
        </motion.div>
      </div>
    </div>
  );
}

// Mini sparkline chart for weekly history
function WeeklySparkline({ data }: { data: DailyBalance[] }) {
  const chartData = data.map((d) => ({
    day: d.dayLabel,
    balance: d.balance,
    consumed: d.consumed,
    isPositive: d.balance >= 0,
  }));

  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
          <defs>
            <linearGradient id="balancePositive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="balanceNegative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
          />
          <YAxis hide domain={['dataMin - 200', 'dataMax + 200']} />
          <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="3 3" />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-100 text-xs">
                    <div className="font-medium text-gray-900">{data.day}</div>
                    <div className={cn(
                      'font-bold',
                      data.balance >= 0 ? 'text-emerald-600' : 'text-red-500'
                    )}>
                      {data.balance >= 0 ? '+' : ''}{data.balance} kcal
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#balancePositive)"
          />
        </AreaChart>
      </ResponsiveContainer>
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
  trend,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  unit: string;
  trend?: 'up' | 'down' | 'neutral';
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

  const handleUsePleasureCredit = () => {
    // Navigate to meals/add with pleasure credit context
    router.push('/meals/add?tab=ai&mode=pleasure');
  };

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
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Solde plaisir disponible</h3>
              <p className="text-sm text-gray-500">{message.subtitle}</p>
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

      {/* Main content */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between">
          {/* Gauge */}
          <AnimatedGauge
            value={availableBalance}
            max={todayTarget * 2} // Max = 2 jours d'économie
          />

          {/* Right side info */}
          <div className="flex-1 ml-4 space-y-3">
            {/* Impact badge */}
            <ImpactBadge impact={projectedJ7Impact} weightChange={projectedWeightChange} />

            {/* Today stats */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Aujourd'hui</span>
                <span className={cn(
                  'font-semibold',
                  todayBalance >= 0 ? 'text-emerald-600' : 'text-red-500'
                )}>
                  {todayBalance >= 0 ? '+' : ''}{todayBalance.toLocaleString('fr-FR')} kcal
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    'h-full rounded-full',
                    todayConsumed <= todayTarget
                      ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                      : 'bg-gradient-to-r from-red-400 to-red-500'
                  )}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.min(100, (todayConsumed / todayTarget) * 100)}%`,
                  }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{todayConsumed.toLocaleString('fr-FR')} kcal</span>
                <span>{todayTarget.toLocaleString('fr-FR')} kcal</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly chart */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-500">7 derniers jours</span>
        </div>
        <WeeklySparkline data={weeklyHistory} />
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

              <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-xs text-amber-800">
                  <strong>Comment ça marche ?</strong> Chaque jour où tu manges moins que ton objectif,
                  tu accumules des calories dans ton "solde plaisir". Tu peux ensuite les utiliser
                  pour te faire plaisir sans culpabilité !
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
