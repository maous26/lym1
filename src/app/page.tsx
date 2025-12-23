'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useSoloProfile, useActiveMode, useIsHydrated } from '@/store/user-store';
import { getSuggestedRecipes, type SuggestedRecipe } from '@/app/actions/recipe-suggestions';
import { useTodayMeals } from '@/store/meal-store';
import { BottomNav } from '@/components/ui/BottomNav';
import {
  WelcomeWidget,
  NutritionRingWidget,
  MacronutrientsChartWidget,
  CaloricBalanceWidget,
  TodayMealsWidget,
  CoachInsightWidget,
  RecipeSuggestionWidget,
  HydrationWidget,
} from '@/components/features/dashboard/widgets';
import { useCaloricBalance } from '@/hooks/useCaloricBalance';
import { useMealStore } from '@/store/meal-store';
import { WeightTracker, WeightTrackerRef } from '@/components/features/weight/WeightTracker';
import { ConnectedDevices } from '@/components/features/weight/ConnectedDevices';
import { SubmitRecipeWidget } from '@/components/features/recipes';
import { XpToast } from '@/components/features/gamification';
import { ChevronDown, ChevronUp, Scale, Bluetooth } from 'lucide-react';

// Recipe type is now imported from recipe-suggestions action

export default function HomePage() {
  const router = useRouter();
  const isHydrated = useIsHydrated();
  const soloProfile = useSoloProfile();
  const activeMode = useActiveMode();
  const todayMeals = useTodayMeals();
  const { meals, syncFromDatabase } = useMealStore();
  const caloricBalance = useCaloricBalance();

  // Sync meals from database on mount
  useEffect(() => {
    if (isHydrated) {
      syncFromDatabase();
    }
  }, [isHydrated, syncFromDatabase]);

  // Ref for WeightTracker to refresh after sync
  const weightTrackerRef = useRef<WeightTrackerRef>(null);

  // Collapsible states for widgets
  const [isWeightExpanded, setIsWeightExpanded] = useState(false);
  const [isDevicesExpanded, setIsDevicesExpanded] = useState(false);
  const [hasConnectedDevice, setHasConnectedDevice] = useState(false);

  // XP toast state
  const [xpToast, setXpToast] = useState<{ show: boolean; amount: number; reason?: string }>({
    show: false,
    amount: 0,
  });

  // Handle sync completion from ConnectedDevices
  const handleWeightSyncComplete = () => {
    weightTrackerRef.current?.refresh();
    setHasConnectedDevice(true);
  };

  // Local state for dynamic data
  const [hydration, setHydration] = useState(1200);
  const hydrationGoal = 2500;

  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Dynamic recipe suggestions
  const [suggestedRecipes, setSuggestedRecipes] = useState<SuggestedRecipe[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Load suggested recipes
  useEffect(() => {
    const loadSuggestions = async () => {
      if (!isHydrated) return;

      setSuggestionsLoading(true);
      const result = await getSuggestedRecipes(
        soloProfile ? {
          id: soloProfile.id,
          goal: soloProfile.goal,
          dietType: soloProfile.dietType,
          allergies: soloProfile.allergies,
          intolerances: soloProfile.intolerances,
          dislikedFoods: soloProfile.dislikedFoods,
          cookingTimeWeekday: soloProfile.cookingTimeWeekday,
          dailyCaloriesTarget: soloProfile.dailyCaloriesTarget,
        } : null,
        6
      );

      if (result.success) {
        setSuggestedRecipes(result.recipes);
      }
      setSuggestionsLoading(false);
    };

    loadSuggestions();
  }, [isHydrated, soloProfile]);

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  const coachInsights = [
    {
      id: '1',
      type: 'tip' as const,
      title: 'Conseil du jour',
      message: 'Tu as bien géré tes protéines hier ! Continue sur cette lancée pour optimiser ta récupération musculaire.',
      actionLabel: 'Voir mes macros',
      priority: 'normal' as const,
    },
  ];

  // Handlers
  const handleAddMeal = (type: 'breakfast' | 'lunch' | 'snack' | 'dinner') => {
    router.push(`/meals/add?type=${type}`);
  };

  const handleViewMeal = (type: 'breakfast' | 'lunch' | 'snack' | 'dinner') => {
    router.push('/meals');
  };

  const handleRecipeClick = (recipeId: string) => {
    router.push(`/recipes/${recipeId}`);
  };

  const handleToggleFavorite = (recipeId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.add(recipeId);
      }
      return next;
    });
  };

  const handleAddHydration = (amount: number) => {
    setHydration((prev) => Math.min(prev + amount, hydrationGoal + 1000));
  };

  const handleRemoveHydration = (amount: number) => {
    setHydration((prev) => Math.max(prev - amount, 0));
  };

  const handlePlanPleasureMeal = () => {
    router.push('/meals/add?tab=ai&mode=pleasure');
  };

  // Handle recipe submission success
  const handleRecipeSubmitSuccess = (recipe: any, xpEarned: number) => {
    setXpToast({ show: true, amount: xpEarned, reason: 'Recette soumise' });
    setTimeout(() => setXpToast({ show: false, amount: 0 }), 3000);
  };

  // Loading state
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-amber-50 flex items-center justify-center">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center"
        >
          <span className="text-3xl">🌱</span>
        </motion.div>
      </div>
    );
  }

  // Current nutrition data - utiliser les valeurs du profil utilisateur
  const currentCalories = todayMeals?.totalNutrition?.calories || 0;
  const targetCalories = soloProfile?.dailyCaloriesTarget || 2000;
  const currentProteins = todayMeals?.totalNutrition?.proteins || 0;
  const targetProteins = soloProfile?.proteinTarget || 150;
  const currentCarbs = todayMeals?.totalNutrition?.carbs || 0;
  const targetCarbs = soloProfile?.carbsTarget || 250;
  const currentFats = todayMeals?.totalNutrition?.fats || 0;
  const targetFats = soloProfile?.fatTarget || 65;

  // Données historiques pour le graphique des macronutriments
  const macroChartData = useMemo(() => {
    const data: Array<{
      date: string;
      proteins: number;
      carbs: number;
      fats: number;
      calories: number;
    }> = [];

    // Générer les données pour les 90 derniers jours
    const today = new Date();
    for (let i = 89; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];

      const dayMeals = meals[dateKey];
      const nutrition = dayMeals?.totalNutrition;

      data.push({
        date: dateKey,
        proteins: nutrition?.proteins || 0,
        carbs: nutrition?.carbs || 0,
        fats: nutrition?.fats || 0,
        calories: nutrition?.calories || 0,
      });
    }

    return data;
  }, [meals]);

  // Meals status
  const mealSlots = [
    {
      type: 'breakfast' as const,
      label: 'Petit-déj',
      status: todayMeals?.breakfast ? 'logged' as const : 'empty' as const,
      calories: todayMeals?.breakfast?.totalNutrition?.calories,
      plannedRecipe: undefined,
    },
    {
      type: 'lunch' as const,
      label: 'Déjeuner',
      status: todayMeals?.lunch ? 'logged' as const : 'empty' as const,
      calories: todayMeals?.lunch?.totalNutrition?.calories,
      plannedRecipe: undefined,
    },
    {
      type: 'snack' as const,
      label: 'Collation',
      status: todayMeals?.snack ? 'logged' as const : 'empty' as const,
      calories: todayMeals?.snack?.totalNutrition?.calories,
      plannedRecipe: undefined,
    },
    {
      type: 'dinner' as const,
      label: 'Dîner',
      status: todayMeals?.dinner ? 'logged' as const : 'empty' as const,
      calories: todayMeals?.dinner?.totalNutrition?.calories,
      plannedRecipe: undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-amber-50">
      {/* Header Decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.3), transparent)',
          }}
          animate={{ scale: [0.9, 1, 0.9] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute top-1/3 -left-32 w-56 h-56 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(245, 158, 11, 0.25), transparent)',
          }}
          animate={{ scale: [1, 0.9, 1] }}
          transition={{ duration: 10, repeat: Infinity, delay: 1 }}
        />
      </div>

      {/* Main Content */}
      <main className="relative z-10 px-4 pt-safe pb-24">
        {/* Welcome Section */}
        <section className="pt-6">
          <WelcomeWidget
            firstName={soloProfile?.firstName || 'Utilisateur'}
            greeting={getGreeting()}
            streak={5}
            motivationalMessage="Continue comme ça, tu es sur la bonne voie !"
            onViewCalendar={() => router.push('/meals?tab=calendar')}
          />
        </section>

        {/* Nutrition Ring */}
        <section className="mt-6">
          <NutritionRingWidget
            currentCalories={currentCalories}
            targetCalories={targetCalories}
            proteins={{ current: currentProteins, target: targetProteins }}
            carbs={{ current: currentCarbs, target: targetCarbs }}
            fats={{ current: currentFats, target: targetFats }}
            onViewDetails={() => router.push('/nutrition')}
          />
        </section>

        {/* Macronutrients Chart */}
        <section className="mt-6">
          <MacronutrientsChartWidget
            data={macroChartData}
            onViewDetails={() => router.push('/nutrition')}
          />
        </section>

        {/* Caloric Balance Widget */}
        <section className="mt-6">
          <CaloricBalanceWidget
            availableBalance={caloricBalance.availableBalance}
            weeklyHistory={caloricBalance.weeklyHistory}
            projectedJ7Impact={caloricBalance.projectedJ7Impact}
            projectedWeightChange={caloricBalance.projectedWeightChange}
            todayBalance={caloricBalance.todayBalance}
            todayTarget={caloricBalance.todayTarget}
            todayConsumed={caloricBalance.todayConsumed}
            canUsePleasureCredit={caloricBalance.canUsePleasureCredit}
            message={caloricBalance.message}
            lastResetDate={caloricBalance.lastResetDate}
            onReset={caloricBalance.resetBalance}
            canReset={caloricBalance.canReset}
            daysUntilReset={caloricBalance.daysUntilReset}
            reportDay={caloricBalance.reportDay}
            onReportDayChange={caloricBalance.setReportDay}
          />
        </section>

        {/* Today's Meals */}
        <section className="mt-6">
          <TodayMealsWidget
            meals={mealSlots}
            onAddMeal={handleAddMeal}
            onViewMeal={handleViewMeal}
            onViewPlan={() => router.push('/plan')}
          />
        </section>

        {/* Coach Insight */}
        <section className="mt-6">
          <AnimatePresence>
            {coachInsights.map((insight) => (
              <CoachInsightWidget
                key={insight.id}
                {...insight}
                onAction={() => router.push('/coach')}
                onDismiss={() => { }}
              />
            ))}
          </AnimatePresence>
        </section>

        {/* Hydration */}
        <section className="mt-6">
          <HydrationWidget
            current={hydration}
            goal={hydrationGoal}
            onAdd={handleAddHydration}
            onRemove={handleRemoveHydration}
          />
        </section>

        {/* Recipe Suggestions */}
        <section className="mt-6">
          <RecipeSuggestionWidget
            recipes={suggestedRecipes.map((r) => ({
              ...r,
              isFavorite: favorites.has(r.id) || r.isFavorite,
            }))}
            onRecipeClick={handleRecipeClick}
            onToggleFavorite={handleToggleFavorite}
            onSeeAll={() => router.push('/meals/add?tab=recipes')}
          />
        </section>

        {/* Submit Recipe Widget */}
        <section className="mt-6">
          <SubmitRecipeWidget onSuccess={handleRecipeSubmitSuccess} />
        </section>

        {/* Weight Tracking - Collapsible */}
        <section className="mt-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setIsWeightExpanded(!isWeightExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Scale className="h-5 w-5 text-white" />
                </div>
                <span className="font-bold text-gray-900">Suivi du poids</span>
              </div>
              {isWeightExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              )}
            </button>
            <AnimatePresence>
              {isWeightExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden border-t border-gray-100"
                >
                  <WeightTracker ref={weightTrackerRef} hideHeader />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Connected Devices - Collapsible */}
        <section className="mt-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setIsDevicesExpanded(!isDevicesExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                  <Bluetooth className="h-5 w-5 text-white" />
                </div>
                <span className="font-bold text-gray-900">
                  {hasConnectedDevice ? 'Appareil connecté' : 'Connecter un appareil'}
                </span>
              </div>
              {isDevicesExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              )}
            </button>
            <AnimatePresence>
              {isDevicesExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden border-t border-gray-100"
                >
                  <ConnectedDevices onSyncComplete={handleWeightSyncComplete} hideHeader />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Bottom Navigation */}
      <BottomNav variant={activeMode === 'family' ? 'family' : 'solo'} />

      {/* XP Toast */}
      <XpToast
        isVisible={xpToast.show}
        xpAmount={xpToast.amount}
        reason={xpToast.reason}
      />
    </div>
  );
}
