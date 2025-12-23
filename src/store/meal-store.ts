import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Meal,
  MealType,
  MealSource,
  DailyMeals,
  DailyNutrition,
  NutritionInfo,
  FoodItem,
  MealItem,
  MealPlan,
} from '@/types/meal';
import { saveMeal, deleteMeal as deleteMealFromDb, loadAllMeals, type MealData } from '@/app/actions/sync';

// Get today's date in YYYY-MM-DD format
const getTodayDate = () => new Date().toISOString().split('T')[0];

interface MealState {
  // Current date context
  selectedDate: string;

  // Meals data
  meals: Record<string, DailyMeals>; // keyed by date
  currentMealInProgress: Partial<Meal> | null;

  // Daily nutrition
  dailyNutrition: Record<string, DailyNutrition>; // keyed by date

  // Active meal plan
  activeMealPlan: MealPlan | null;

  // Add meal flow
  addMealType: MealType | null;
  addMealItems: MealItem[];

  // Loading states
  isLoading: boolean;
}

interface MealActions {
  // Date navigation
  setSelectedDate: (date: string) => void;
  goToToday: () => void;
  goToPreviousDay: () => void;
  goToNextDay: () => void;

  // Meals CRUD
  addMeal: (meal: Meal) => void;
  updateMeal: (mealId: string, updates: Partial<Meal>) => void;
  deleteMeal: (date: string, mealType: MealType) => void;
  deleteMealItem: (date: string, mealType: MealType, itemId: string) => void;

  // Database sync
  syncFromDatabase: () => Promise<void>;
  setMealsFromDb: (meals: MealData[]) => void;

  // Add meal flow
  startAddMeal: (type: MealType) => void;
  addItemToMeal: (item: MealItem) => void;
  updateMealItem: (itemId: string, updates: Partial<MealItem>) => void;
  removeItemFromMeal: (itemId: string) => void;
  saveMealInProgress: () => void;
  cancelAddMeal: () => void;

  // Daily nutrition
  calculateDailyNutrition: (date: string) => void;
  setDailyNutrition: (date: string, nutrition: DailyNutrition) => void;

  // Meal plan
  setActiveMealPlan: (plan: MealPlan | null) => void;
  markMealCompleted: (date: string, mealType: MealType) => void;

  // Utils
  getMealsForDate: (date: string) => DailyMeals | null;
  getTodayNutrition: () => DailyNutrition | null;

  // Reset
  reset: () => void;
}

// Calculate total nutrition from items
const calculateTotalNutrition = (items: MealItem[]): NutritionInfo => {
  return items.reduce(
    (total, item) => {
      const multiplier = item.quantity;
      return {
        calories: total.calories + item.food.nutrition.calories * multiplier,
        proteins: total.proteins + item.food.nutrition.proteins * multiplier,
        carbs: total.carbs + item.food.nutrition.carbs * multiplier,
        fats: total.fats + item.food.nutrition.fats * multiplier,
        fiber: (total.fiber || 0) + (item.food.nutrition.fiber || 0) * multiplier,
        sugar: (total.sugar || 0) + (item.food.nutrition.sugar || 0) * multiplier,
        sodium: (total.sodium || 0) + (item.food.nutrition.sodium || 0) * multiplier,
        saturatedFat:
          (total.saturatedFat || 0) +
          (item.food.nutrition.saturatedFat || 0) * multiplier,
      };
    },
    {
      calories: 0,
      proteins: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      saturatedFat: 0,
    }
  );
};

const initialState: MealState = {
  selectedDate: getTodayDate(),
  meals: {},
  currentMealInProgress: null,
  dailyNutrition: {},
  activeMealPlan: null,
  addMealType: null,
  addMealItems: [],
  isLoading: false,
};

export const useMealStore = create<MealState & MealActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Date navigation
      setSelectedDate: (date) => set({ selectedDate: date }),
      goToToday: () => set({ selectedDate: getTodayDate() }),
      goToPreviousDay: () => {
        const current = new Date(get().selectedDate);
        current.setDate(current.getDate() - 1);
        set({ selectedDate: current.toISOString().split('T')[0] });
      },
      goToNextDay: () => {
        const current = new Date(get().selectedDate);
        current.setDate(current.getDate() + 1);
        set({ selectedDate: current.toISOString().split('T')[0] });
      },

      // Database sync
      syncFromDatabase: async () => {
        set({ isLoading: true });
        try {
          const result = await loadAllMeals();
          if (result.success && 'meals' in result) {
            // Always sync from DB - if empty array, clear local data
            get().setMealsFromDb(result.meals || []);
          }
        } catch (error) {
          console.error('Error syncing meals from database:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      setMealsFromDb: (dbMeals) => {
        const mealsMap: Record<string, DailyMeals> = {};

        for (const meal of dbMeals) {
          const dateKey = meal.date;
          if (!mealsMap[dateKey]) {
            mealsMap[dateKey] = {
              date: dateKey,
              totalNutrition: { calories: 0, proteins: 0, carbs: 0, fats: 0 },
              caloriesGoal: 2000,
              proteinsGoal: 150,
              carbsGoal: 250,
              fatsGoal: 65,
            };
          }

          // Convert DB meal to local Meal format
          const localMeal: Meal = {
            id: meal.id,
            type: meal.type as MealType,
            date: meal.date,
            time: meal.time || new Date().toTimeString().slice(0, 5),
            items: meal.items.map((item) => ({
              id: item.id,
              quantity: item.quantity,
              food: {
                id: item.foodId || item.id,
                name: item.name,
                serving: 1,
                servingUnit: item.unit,
                nutrition: {
                  calories: item.calories / item.quantity,
                  proteins: item.proteins / item.quantity,
                  carbs: item.carbs / item.quantity,
                  fats: item.fats / item.quantity,
                },
                source: 'manual' as const,
              },
            })),
            totalNutrition: {
              calories: meal.calories,
              proteins: meal.proteins,
              carbs: meal.carbs,
              fats: meal.fats,
              fiber: meal.fiber,
              sugar: meal.sugar,
              sodium: meal.sodium,
            },
            source: (meal.source === 'plan' ? 'recipe' : meal.source) as MealSource,
            isPlanned: meal.isPlanned,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          mealsMap[dateKey][meal.type as MealType] = localMeal;
        }

        // Recalculate total nutrition for each day
        for (const dateKey of Object.keys(mealsMap)) {
          const dayMeals = mealsMap[dateKey];
          const allMeals = [
            dayMeals.breakfast,
            dayMeals.lunch,
            dayMeals.snack,
            dayMeals.dinner,
          ].filter(Boolean) as Meal[];

          dayMeals.totalNutrition = allMeals.reduce(
            (total, m) => ({
              calories: total.calories + m.totalNutrition.calories,
              proteins: total.proteins + m.totalNutrition.proteins,
              carbs: total.carbs + m.totalNutrition.carbs,
              fats: total.fats + m.totalNutrition.fats,
            }),
            { calories: 0, proteins: 0, carbs: 0, fats: 0 }
          );
        }

        set({ meals: mealsMap });
      },

      // Meals CRUD
      addMeal: (meal) => {
        // Update local state
        set((state) => {
          const dateKey = meal.date;
          const existing = state.meals[dateKey] || {
            date: dateKey,
            totalNutrition: { calories: 0, proteins: 0, carbs: 0, fats: 0 },
            caloriesGoal: 2000,
            proteinsGoal: 150,
            carbsGoal: 250,
            fatsGoal: 65,
          };

          // Check if there's already a meal of this type for this date
          const existingMealOfType = existing[meal.type] as Meal | undefined;

          let updatedMeal: Meal;
          if (existingMealOfType) {
            // Merge items: add new items to existing meal
            const mergedItems = [...existingMealOfType.items, ...meal.items];
            const mergedNutrition = {
              calories: existingMealOfType.totalNutrition.calories + meal.totalNutrition.calories,
              proteins: existingMealOfType.totalNutrition.proteins + meal.totalNutrition.proteins,
              carbs: existingMealOfType.totalNutrition.carbs + meal.totalNutrition.carbs,
              fats: existingMealOfType.totalNutrition.fats + meal.totalNutrition.fats,
            };
            updatedMeal = {
              ...existingMealOfType,
              items: mergedItems,
              totalNutrition: mergedNutrition,
              updatedAt: new Date().toISOString(),
            };
          } else {
            // No existing meal, use the new one as-is
            updatedMeal = meal;
          }

          const updated = {
            ...existing,
            [meal.type]: updatedMeal,
          };

          // Recalculate total nutrition
          const allMeals = [
            updated.breakfast,
            updated.lunch,
            updated.snack,
            updated.dinner,
          ].filter(Boolean) as Meal[];

          updated.totalNutrition = allMeals.reduce(
            (total, m) => ({
              calories: total.calories + m.totalNutrition.calories,
              proteins: total.proteins + m.totalNutrition.proteins,
              carbs: total.carbs + m.totalNutrition.carbs,
              fats: total.fats + m.totalNutrition.fats,
            }),
            { calories: 0, proteins: 0, carbs: 0, fats: 0 }
          );

          return {
            meals: {
              ...state.meals,
              [dateKey]: updated,
            },
          };
        });

        // Sync to database (async, non-blocking)
        const dbMeal: MealData = {
          id: meal.id,
          type: meal.type,
          date: meal.date,
          time: meal.time,
          calories: meal.totalNutrition.calories,
          proteins: meal.totalNutrition.proteins,
          carbs: meal.totalNutrition.carbs,
          fats: meal.totalNutrition.fats,
          fiber: meal.totalNutrition.fiber,
          sugar: meal.totalNutrition.sugar,
          sodium: meal.totalNutrition.sodium,
          source: meal.source || 'manual',
          isPlanned: meal.isPlanned,
          items: meal.items.map((item) => ({
            id: item.id,
            name: item.food.name,
            quantity: item.quantity,
            unit: item.food.servingUnit || 'g',
            calories: item.food.nutrition.calories * item.quantity,
            proteins: item.food.nutrition.proteins * item.quantity,
            carbs: item.food.nutrition.carbs * item.quantity,
            fats: item.food.nutrition.fats * item.quantity,
            foodId: item.food.id,
          })),
        };

        saveMeal(dbMeal).catch((err) => console.error('Error saving meal to database:', err));
      },

      updateMeal: (mealId, updates) =>
        set((state) => {
          // Find the meal across all dates
          const newMeals = { ...state.meals };
          for (const [date, dailyMeals] of Object.entries(newMeals)) {
            for (const type of ['breakfast', 'lunch', 'snack', 'dinner'] as MealType[]) {
              const meal = dailyMeals[type];
              if (meal && meal.id === mealId) {
                newMeals[date] = {
                  ...dailyMeals,
                  [type]: { ...meal, ...updates },
                };
                return { meals: newMeals };
              }
            }
          }
          return state;
        }),

      deleteMeal: (date, mealType) => {
        // Update local state
        set((state) => {
          const dailyMeals = state.meals[date];
          if (!dailyMeals) return state;

          const updated = { ...dailyMeals };
          delete updated[mealType];

          return {
            meals: {
              ...state.meals,
              [date]: updated,
            },
          };
        });

        // Sync deletion to database
        deleteMealFromDb(date, mealType).catch((err) =>
          console.error('Error deleting meal from database:', err)
        );
      },

      deleteMealItem: (date, mealType, itemId) => {
        set((state) => {
          const dailyMeals = state.meals[date];
          if (!dailyMeals) return state;

          const meal = dailyMeals[mealType];
          if (!meal) return state;

          // Filter out the item
          const updatedItems = meal.items.filter((item) => item.id !== itemId);

          // If no items left, delete the whole meal
          if (updatedItems.length === 0) {
            const updated = { ...dailyMeals };
            delete updated[mealType];

            // Recalculate total nutrition for the day
            const allMeals = [
              updated.breakfast,
              updated.lunch,
              updated.snack,
              updated.dinner,
            ].filter(Boolean) as Meal[];

            updated.totalNutrition = allMeals.reduce(
              (total, m) => ({
                calories: total.calories + m.totalNutrition.calories,
                proteins: total.proteins + m.totalNutrition.proteins,
                carbs: total.carbs + m.totalNutrition.carbs,
                fats: total.fats + m.totalNutrition.fats,
              }),
              { calories: 0, proteins: 0, carbs: 0, fats: 0 }
            );

            // Sync deletion to database
            deleteMealFromDb(date, mealType).catch((err) =>
              console.error('Error deleting meal from database:', err)
            );

            return {
              meals: {
                ...state.meals,
                [date]: updated,
              },
            };
          }

          // Recalculate meal nutrition
          const updatedNutrition = calculateTotalNutrition(updatedItems);

          const updatedMeal: Meal = {
            ...meal,
            items: updatedItems,
            totalNutrition: updatedNutrition,
            updatedAt: new Date().toISOString(),
          };

          const updated = {
            ...dailyMeals,
            [mealType]: updatedMeal,
          };

          // Recalculate total nutrition for the day
          const allMeals = [
            updated.breakfast,
            updated.lunch,
            updated.snack,
            updated.dinner,
          ].filter(Boolean) as Meal[];

          updated.totalNutrition = allMeals.reduce(
            (total, m) => ({
              calories: total.calories + m.totalNutrition.calories,
              proteins: total.proteins + m.totalNutrition.proteins,
              carbs: total.carbs + m.totalNutrition.carbs,
              fats: total.fats + m.totalNutrition.fats,
            }),
            { calories: 0, proteins: 0, carbs: 0, fats: 0 }
          );

          // Sync updated meal to database
          const dbMeal: MealData = {
            id: updatedMeal.id,
            type: updatedMeal.type,
            date: updatedMeal.date,
            time: updatedMeal.time,
            calories: updatedMeal.totalNutrition.calories,
            proteins: updatedMeal.totalNutrition.proteins,
            carbs: updatedMeal.totalNutrition.carbs,
            fats: updatedMeal.totalNutrition.fats,
            fiber: updatedMeal.totalNutrition.fiber,
            sugar: updatedMeal.totalNutrition.sugar,
            sodium: updatedMeal.totalNutrition.sodium,
            source: updatedMeal.source || 'manual',
            isPlanned: updatedMeal.isPlanned,
            items: updatedItems.map((item) => ({
              id: item.id,
              name: item.food.name,
              quantity: item.quantity,
              unit: item.food.servingUnit || 'g',
              calories: item.food.nutrition.calories * item.quantity,
              proteins: item.food.nutrition.proteins * item.quantity,
              carbs: item.food.nutrition.carbs * item.quantity,
              fats: item.food.nutrition.fats * item.quantity,
              foodId: item.food.id,
            })),
          };

          saveMeal(dbMeal).catch((err) =>
            console.error('Error updating meal in database:', err)
          );

          return {
            meals: {
              ...state.meals,
              [date]: updated,
            },
          };
        });
      },

      // Add meal flow
      startAddMeal: (type) =>
        set({
          addMealType: type,
          addMealItems: [],
          currentMealInProgress: {
            type,
            date: get().selectedDate,
            time: new Date().toTimeString().slice(0, 5),
            items: [],
            isPlanned: false,
          },
        }),

      addItemToMeal: (item) =>
        set((state) => ({
          addMealItems: [...state.addMealItems, item],
        })),

      updateMealItem: (itemId, updates) =>
        set((state) => ({
          addMealItems: state.addMealItems.map((item) =>
            item.id === itemId ? { ...item, ...updates } : item
          ),
        })),

      removeItemFromMeal: (itemId) =>
        set((state) => ({
          addMealItems: state.addMealItems.filter((item) => item.id !== itemId),
        })),

      saveMealInProgress: () => {
        const { addMealType, addMealItems, selectedDate } = get();
        if (!addMealType || addMealItems.length === 0) return;

        const totalNutrition = calculateTotalNutrition(addMealItems);

        const meal: Meal = {
          id: Math.random().toString(36).substring(2, 9),
          type: addMealType,
          date: selectedDate,
          time: new Date().toTimeString().slice(0, 5),
          items: addMealItems,
          totalNutrition,
          source: 'manual',
          isPlanned: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        get().addMeal(meal);
        set({
          addMealType: null,
          addMealItems: [],
          currentMealInProgress: null,
        });
      },

      cancelAddMeal: () =>
        set({
          addMealType: null,
          addMealItems: [],
          currentMealInProgress: null,
        }),

      // Daily nutrition
      calculateDailyNutrition: (date) => {
        const meals = get().meals[date];
        if (!meals) return;

        const consumed = meals.totalNutrition;
        const target = {
          calories: meals.caloriesGoal,
          proteins: meals.proteinsGoal,
          carbs: meals.carbsGoal,
          fats: meals.fatsGoal,
        };

        const nutrition: DailyNutrition = {
          date,
          consumed: consumed as NutritionInfo,
          target: target as NutritionInfo,
          remaining: {
            calories: target.calories - consumed.calories,
            proteins: target.proteins - consumed.proteins,
            carbs: target.carbs - consumed.carbs,
            fats: target.fats - consumed.fats,
          },
          percentage: {
            calories: Math.round((consumed.calories / target.calories) * 100),
            proteins: Math.round((consumed.proteins / target.proteins) * 100),
            carbs: Math.round((consumed.carbs / target.carbs) * 100),
            fats: Math.round((consumed.fats / target.fats) * 100),
          },
        };

        set((state) => ({
          dailyNutrition: {
            ...state.dailyNutrition,
            [date]: nutrition,
          },
        }));
      },

      setDailyNutrition: (date, nutrition) =>
        set((state) => ({
          dailyNutrition: {
            ...state.dailyNutrition,
            [date]: nutrition,
          },
        })),

      // Meal plan
      setActiveMealPlan: (plan) => set({ activeMealPlan: plan }),
      markMealCompleted: (date, mealType) => {
        // Update the meal plan status
        const { activeMealPlan } = get();
        if (!activeMealPlan) return;

        set((state) => ({
          activeMealPlan: state.activeMealPlan
            ? {
                ...state.activeMealPlan,
                days: state.activeMealPlan.days.map((day) =>
                  day.date === date
                    ? {
                        ...day,
                        [mealType]: day[mealType]
                          ? { ...day[mealType], isCompleted: true }
                          : undefined,
                      }
                    : day
                ),
              }
            : null,
        }));
      },

      // Utils
      getMealsForDate: (date) => get().meals[date] || null,
      getTodayNutrition: () => get().dailyNutrition[getTodayDate()] || null,

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: 'lym-meal-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        meals: state.meals,
        dailyNutrition: state.dailyNutrition,
        activeMealPlan: state.activeMealPlan,
      }),
    }
  )
);

// Selector hooks
export const useSelectedDate = () => useMealStore((state) => state.selectedDate);
export const useTodayMeals = () => {
  // Use the selector pattern that recalculates today's date on each call
  const todayDate = new Date().toISOString().split('T')[0];
  return useMealStore((state) => state.meals[todayDate]);
};
export const useSelectedDateMeals = () =>
  useMealStore((state) => state.meals[state.selectedDate]);
export const useAddMealItems = () => useMealStore((state) => state.addMealItems);
export const useActiveMealPlan = () => useMealStore((state) => state.activeMealPlan);
