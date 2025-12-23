'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Coffee,
  Sun,
  Cookie,
  Moon,
  Plus,
  Trash2,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Meal, MealType, MealItem } from '@/types/meal';

interface MealSectionProps {
  type: MealType;
  meal?: Meal | null;
  onAddMeal: () => void;
  onViewMeal?: () => void;
  onDeleteMeal?: () => void;
  onDeleteItem?: (itemId: string) => void;
  onItemClick?: (item: MealItem) => void;
  onFeedback?: (positive: boolean) => void;
  isEditable?: boolean;
  showDeleteButtons?: boolean;
  className?: string;
}

// Meal type configuration
const MEAL_CONFIG: Record<
  MealType,
  {
    label: string;
    icon: React.ElementType;
    gradient: string;
    iconColor: string;
    timeRange: string;
  }
> = {
  breakfast: {
    label: 'Petit-déjeuner',
    icon: Coffee,
    gradient: 'from-amber-100 to-orange-100',
    iconColor: 'text-amber-600',
    timeRange: '6h - 10h',
  },
  lunch: {
    label: 'Déjeuner',
    icon: Sun,
    gradient: 'from-emerald-100 to-teal-100',
    iconColor: 'text-emerald-600',
    timeRange: '11h - 14h',
  },
  snack: {
    label: 'Collation',
    icon: Cookie,
    gradient: 'from-purple-100 to-pink-100',
    iconColor: 'text-purple-600',
    timeRange: '15h - 17h',
  },
  dinner: {
    label: 'Dîner',
    icon: Moon,
    gradient: 'from-blue-100 to-indigo-100',
    iconColor: 'text-blue-600',
    timeRange: '18h - 21h',
  },
};

// Meal item row component
const MealItemRow = ({
  item,
  onDelete,
  onItemClick,
  showDeleteButton = true,
}: {
  item: MealItem;
  onDelete?: () => void;
  onItemClick?: () => void;
  showDeleteButton?: boolean;
}) => {
  const nutrition = item.food.nutrition;
  const totalCalories = Math.round(nutrition.calories * item.quantity);
  const isAiRecipe = item.food.source === 'ai' || item.food.source === 'recipe';

  const handleClick = () => {
    if (onItemClick) {
      onItemClick();
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex items-center gap-3 py-2"
    >
      {/* Food image or placeholder - clickable if AI recipe */}
      <div
        onClick={isAiRecipe ? handleClick : undefined}
        className={cn(
          "w-12 h-12 rounded-xl bg-stone-100 overflow-hidden flex-shrink-0 relative",
          isAiRecipe && "cursor-pointer hover:ring-2 hover:ring-primary-400 transition-all"
        )}
      >
        {item.food.imageUrl ? (
          <Image
            src={item.food.imageUrl}
            alt={item.food.name}
            width={48}
            height={48}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-400 text-lg">
            🍽️
          </div>
        )}
        {/* AI badge */}
        {isAiRecipe && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-sm">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* Food info - clickable if AI recipe */}
      <div
        onClick={isAiRecipe ? handleClick : undefined}
        className={cn(
          "flex-1 min-w-0",
          isAiRecipe && "cursor-pointer"
        )}
      >
        <div className={cn(
          "font-medium text-stone-800 truncate text-sm",
          isAiRecipe && "hover:text-primary-600 transition-colors"
        )}>
          {item.food.name}
        </div>
        <div className="text-xs text-stone-500">
          {item.customServing || item.food.serving}
          {item.food.servingUnit} × {item.quantity}
        </div>
      </div>

      {/* Calories */}
      <div className="text-right">
        <div className="font-semibold text-stone-800 text-sm">
          {totalCalories}
        </div>
        <div className="text-xs text-stone-500">kcal</div>
      </div>

      {/* Delete button - always visible when showDeleteButton is true */}
      {showDeleteButton && onDelete && (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </motion.button>
      )}
    </motion.div>
  );
};

export function MealSection({
  type,
  meal,
  onAddMeal,
  onViewMeal,
  onDeleteMeal,
  onDeleteItem,
  onItemClick,
  onFeedback,
  isEditable = false,
  showDeleteButtons = true,
  className,
}: MealSectionProps) {
  const config = MEAL_CONFIG[type];
  const Icon = config.icon;
  const hasMeal = meal && meal.items.length > 0;

  return (
    <motion.div
      layout
      className={cn(
        'bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between px-4 py-3 bg-gradient-to-r',
          config.gradient
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center">
            <Icon className={cn('w-5 h-5', config.iconColor)} />
          </div>
          <div>
            <h3 className="font-semibold text-stone-800">{config.label}</h3>
            <span className="text-xs text-stone-500">{config.timeRange}</span>
          </div>
        </div>

        {/* Meal total calories or add button */}
        {hasMeal ? (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-lg font-bold text-stone-800">
                {Math.round(meal.totalNutrition.calories)}
              </div>
              <div className="text-xs text-stone-500">kcal</div>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onAddMeal}
              className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center text-primary-600"
            >
              <Plus className="w-4 h-4" />
            </motion.button>
          </div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAddMeal}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 text-primary-600 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter</span>
          </motion.button>
        )}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {hasMeal ? (
          <motion.div
            key="meal-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pb-3"
          >
            {/* Items list */}
            <div className="divide-y divide-stone-100">
              {meal.items.map((item) => (
                <MealItemRow
                  key={item.id}
                  item={item}
                  showDeleteButton={showDeleteButtons}
                  onDelete={onDeleteItem ? () => onDeleteItem(item.id) : undefined}
                  onItemClick={onItemClick ? () => onItemClick(item) : undefined}
                />
              ))}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100">
              {/* Feedback buttons */}
              {onFeedback && (
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onFeedback(true)}
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                      meal.feedback?.rating && meal.feedback.rating >= 4
                        ? 'bg-green-100 text-green-600'
                        : 'bg-stone-100 text-stone-400 hover:bg-green-50 hover:text-green-500'
                    )}
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onFeedback(false)}
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                      meal.feedback?.rating && meal.feedback.rating <= 2
                        ? 'bg-red-100 text-red-600'
                        : 'bg-stone-100 text-stone-400 hover:bg-red-50 hover:text-red-500'
                    )}
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </motion.button>
                </div>
              )}

              {/* View details */}
              {onViewMeal && (
                <motion.button
                  whileHover={{ x: 3 }}
                  onClick={onViewMeal}
                  className="flex items-center gap-1 text-sm text-primary-600"
                >
                  <span>Voir détails</span>
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              )}

              {/* Delete meal */}
              {isEditable && onDeleteMeal && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onDeleteMeal}
                  className="text-sm text-red-500 hover:text-red-600"
                >
                  Supprimer le repas
                </motion.button>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-4 py-6 text-center"
          >
            <div className="text-stone-400 text-sm">
              Aucun aliment enregistré
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default MealSection;
