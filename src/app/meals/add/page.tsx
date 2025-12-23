'use client';

import { useState, useCallback, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Search,
  Sparkles,
  Camera,
  Barcode,
  Mic,
  X,
  ShoppingBag,
  Users,
  Star,
  Clock,
  Flame,
  MessageCircle,
  Loader2,
  Plus,
  Zap,
  Coffee,
  UtensilsCrossed,
  Cookie,
  Moon,
  ChevronRight,
} from 'lucide-react';
import { SearchBar } from '@/components/features/search/SearchBar';
import { SearchResults } from '@/components/features/search/SearchResults';
import { QuantitySelector } from '@/components/features/search/QuantitySelector';
import { AIMealGenerator } from '@/components/features/ai/AIMealGenerator';
import { PhotoFoodScanner } from '@/components/features/scanner/PhotoFoodScanner';
import { VoiceFoodInput } from '@/components/features/voice/VoiceFoodInput';
import { useSearchStore, selectIsLoading } from '@/store/search-store';
import type { AnalyzedFood } from '@/app/actions/food-scanner';
import { useMealStore } from '@/store/meal-store';
import { useUserStore, useSoloProfile } from '@/store/user-store';
import type { Product } from '@/types/product';
import type { MealType, FoodItem, MealItem, NutritionInfo } from '@/types/meal';
import type { MeasurementUnit } from '@/lib/unit-utils';
import { getCommunityRecipes } from '@/app/actions/social-recipe';
import { useCaloricBalance } from '@/hooks/useCaloricBalance';

// Tab types
type InputTab = 'search' | 'voice' | 'ai' | 'photo' | 'barcode' | 'recipes';

// Tab configuration with colors
const TABS: { id: InputTab; label: string; icon: React.ElementType; color: string; bgColor: string; activeColor: string; activeBorder: string }[] = [
  { id: 'search', label: 'Recherche', icon: Search, color: 'text-blue-600', bgColor: 'bg-blue-50', activeColor: 'bg-blue-100', activeBorder: 'ring-2 ring-blue-400' },
  { id: 'recipes', label: 'Vos recettes', icon: Users, color: 'text-indigo-600', bgColor: 'bg-indigo-50', activeColor: 'bg-indigo-100', activeBorder: 'ring-2 ring-indigo-400' },
  { id: 'voice', label: 'Vocal', icon: Mic, color: 'text-purple-600', bgColor: 'bg-purple-50', activeColor: 'bg-purple-100', activeBorder: 'ring-2 ring-purple-400' },
  { id: 'ai', label: 'IA', icon: Sparkles, color: 'text-amber-600', bgColor: 'bg-amber-50', activeColor: 'bg-amber-100', activeBorder: 'ring-2 ring-amber-400' },
  { id: 'photo', label: 'Photo', icon: Camera, color: 'text-rose-600', bgColor: 'bg-rose-50', activeColor: 'bg-rose-100', activeBorder: 'ring-2 ring-rose-400' },
  { id: 'barcode', label: 'Code-barres', icon: Barcode, color: 'text-emerald-600', bgColor: 'bg-emerald-50', activeColor: 'bg-emerald-100', activeBorder: 'ring-2 ring-emerald-400' },
];

// Community recipe type
interface CommunityRecipe {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  prepTime: number;
  servings: number;
  averageRating: number;
  ratingsCount: number;
  author: { id: string; name: string | null; image: string | null } | null;
  tags: string[];
}

// Meal type labels
const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  snack: 'Collation',
  dinner: 'Dîner',
};

// Meal selection options for pleasure mode
const MEAL_OPTIONS = [
  {
    type: 'breakfast' as MealType,
    label: 'Petit-déjeuner',
    icon: Coffee,
    color: 'from-amber-400 to-orange-500',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
  },
  {
    type: 'lunch' as MealType,
    label: 'Déjeuner',
    icon: UtensilsCrossed,
    color: 'from-emerald-400 to-teal-500',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
  },
  {
    type: 'snack' as MealType,
    label: 'Collation',
    icon: Cookie,
    color: 'from-pink-400 to-rose-500',
    bgColor: 'bg-pink-50',
    textColor: 'text-pink-700',
  },
  {
    type: 'dinner' as MealType,
    label: 'Dîner',
    icon: Moon,
    color: 'from-indigo-400 to-purple-500',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-700',
  },
];

function AddMealContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const caloricBalance = useCaloricBalance();

  // URL params
  const initialMealType = (searchParams.get('type') as MealType) || 'lunch';
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const isPleasureMode = searchParams.get('mode') === 'pleasure';
  const initialTab = (searchParams.get('tab') as InputTab) || 'search';

  // Local state
  const [selectedMealType, setSelectedMealType] = useState<MealType | null>(
    isPleasureMode ? null : initialMealType
  );
  const [activeTab, setActiveTab] = useState<InputTab>(isPleasureMode ? 'ai' : initialTab);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [addedItems, setAddedItems] = useState<MealItem[]>([]);
  const [communityRecipes, setCommunityRecipes] = useState<CommunityRecipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);

  // Effective meal type (either selected or from URL)
  const mealType = selectedMealType || initialMealType;

  // Load community recipes
  useEffect(() => {
    const loadRecipes = async () => {
      setRecipesLoading(true);
      const result = await getCommunityRecipes({ limit: 20 });
      if (result.success && result.recipes) {
        setCommunityRecipes(result.recipes as CommunityRecipe[]);
      }
      setRecipesLoading(false);
    };
    loadRecipes();
  }, []);

  // Search store
  const query = useSearchStore((state) => state.query);
  const ciqualResults = useSearchStore((state) => state.ciqualResults);
  const offResults = useSearchStore((state) => state.offResults);
  const isLoadingCiqual = useSearchStore((state) => state.isLoadingCiqual);
  const isLoadingOff = useSearchStore((state) => state.isLoadingOff);
  const ciqualError = useSearchStore((state) => state.ciqualError);
  const offError = useSearchStore((state) => state.offError);
  const recentSearches = useSearchStore((state) => state.recentSearches);
  const searchWithDebounce = useSearchStore((state) => state.searchWithDebounce);
  const setQuery = useSearchStore((state) => state.setQuery);
  const clearResults = useSearchStore((state) => state.clearResults);
  const isLoading = useSearchStore(selectIsLoading);

  // Meal store
  const addMeal = useMealStore((state) => state.addMeal);

  // Convert Product to FoodItem
  const productToFoodItem = (product: Product, serving: number): FoodItem => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    serving,
    servingUnit: 'g',
    nutrition: {
      calories: product.calories,
      proteins: product.proteins,
      carbs: product.carbs,
      fats: product.fats,
      fiber: product.fiber,
      sugar: product.sugar,
      sodium: product.sodium,
    },
    imageUrl: product.image,
    source: product.source === 'CIQUAL' ? 'ciqual' : product.source === 'OFF' ? 'openfoodfacts' : 'manual',
  });

  // Handlers
  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
  };

  const handleQuantityConfirm = (quantity: number, unit: MeasurementUnit, equivalentGrams: number) => {
    if (!selectedProduct) return;

    const foodItem = productToFoodItem(selectedProduct, equivalentGrams);
    const mealItem: MealItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      food: foodItem,
      quantity: 1, // Already calculated in equivalentGrams
      customServing: equivalentGrams,
    };

    setAddedItems((prev) => [...prev, mealItem]);
    setSelectedProduct(null);
    clearResults();
  };

  const handleRemoveItem = (itemId: string) => {
    setAddedItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleSaveMeal = () => {
    if (addedItems.length === 0) return;

    // Calculate total nutrition
    const totalNutrition: NutritionInfo = addedItems.reduce<NutritionInfo>(
      (total, item) => {
        const mult = item.quantity;
        return {
          calories: total.calories + item.food.nutrition.calories * mult,
          proteins: total.proteins + item.food.nutrition.proteins * mult,
          carbs: total.carbs + item.food.nutrition.carbs * mult,
          fats: total.fats + item.food.nutrition.fats * mult,
          fiber: (total.fiber || 0) + (item.food.nutrition.fiber || 0) * mult,
          sugar: (total.sugar || 0) + (item.food.nutrition.sugar || 0) * mult,
          sodium: (total.sodium || 0) + (item.food.nutrition.sodium || 0) * mult,
        };
      },
      { calories: 0, proteins: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0 }
    );

    // Create and save meal
    addMeal({
      id: `meal-${Date.now()}`,
      type: mealType,
      date,
      time: new Date().toTimeString().slice(0, 5),
      items: addedItems,
      totalNutrition,
      source: 'manual',
      isPlanned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    router.back();
  };

  const handleBack = () => {
    if (selectedProduct) {
      setSelectedProduct(null);
    } else {
      router.back();
    }
  };

  // Calculate total for added items
  const totalCalories = addedItems.reduce(
    (sum, item) => sum + item.food.nutrition.calories * item.quantity,
    0
  );

  // Show meal selection screen for pleasure mode
  if (isPleasureMode && !selectedMealType) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-amber-50">
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-sm sticky top-0 z-20 border-b border-gray-100">
          <div className="flex items-center gap-3 px-4 py-4">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => router.back()}
              className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
            <div className="flex-1">
              <h1 className="font-bold text-gray-900 text-lg">
                Crédit plaisir
              </h1>
              <span className="text-sm text-gray-500">
                Choisis ton repas plaisir
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-6 space-y-6">
          {/* Balance info card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-5 text-white shadow-xl shadow-emerald-500/30"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-emerald-100 text-sm">Ton solde disponible</p>
                <p className="text-3xl font-bold">
                  {caloricBalance.availableBalance.toLocaleString('fr-FR')} kcal
                </p>
              </div>
            </div>
            <p className="text-emerald-100 text-sm">
              Utilise ces calories pour te faire plaisir sans culpabilité !
            </p>
          </motion.div>

          {/* Meal selection */}
          <div>
            <h2 className="font-bold text-gray-900 text-lg mb-4">
              Pour quel repas veux-tu utiliser ton crédit ?
            </h2>

            <div className="grid grid-cols-2 gap-3">
              {MEAL_OPTIONS.map((meal, index) => {
                const Icon = meal.icon;
                return (
                  <motion.button
                    key={meal.type}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedMealType(meal.type)}
                    className={cn(
                      'p-5 rounded-2xl border-2 border-transparent transition-all',
                      meal.bgColor,
                      'hover:border-gray-200 hover:shadow-lg'
                    )}
                  >
                    <div
                      className={cn(
                        'w-14 h-14 rounded-2xl bg-gradient-to-br mb-3 flex items-center justify-center',
                        meal.color
                      )}
                    >
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className={cn('font-bold text-base', meal.textColor)}>
                      {meal.label}
                    </h3>
                    <div className="flex items-center gap-1 mt-2 text-gray-400">
                      <span className="text-xs">Sélectionner</span>
                      <ChevronRight className="w-3 h-3" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Tips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-amber-50 rounded-2xl p-4 border border-amber-100"
          >
            <p className="text-sm text-amber-800">
              <strong>Conseil :</strong> Choisis le repas où tu as le plus envie de te faire plaisir.
              L'IA va générer une recette gourmande qui correspond à ton crédit disponible.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white sticky top-0 z-20 border-b border-stone-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleBack}
            className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600"
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>
          <div className="flex-1">
            <h1 className="font-semibold text-stone-800">
              {isPleasureMode ? 'Repas plaisir' : 'Ajouter un aliment ou un repas'}
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-sm text-stone-500">
                {MEAL_TYPE_LABELS[mealType]}
              </span>
              {isPleasureMode && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {caloricBalance.availableBalance} kcal
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 gap-1.5 pb-3 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon, color, bgColor, activeColor, activeBorder }) => (
            <motion.button
              key={id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex-1 min-w-[56px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-sm font-medium transition-all',
                activeTab === id
                  ? `${activeColor} ${color} ${activeBorder} shadow-sm`
                  : `${bgColor} ${color} opacity-60 hover:opacity-100`
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4">
        <AnimatePresence mode="wait">
          {activeTab === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Search Bar */}
              <SearchBar
                value={query}
                onChange={setQuery}
                onSearch={searchWithDebounce}
                onClear={clearResults}
                isLoading={isLoading}
                autoFocus
              />

              {/* Search Results */}
              <SearchResults
                query={query}
                ciqualResults={ciqualResults}
                offResults={offResults}
                recentSearches={recentSearches}
                isLoadingCiqual={isLoadingCiqual}
                isLoadingOff={isLoadingOff}
                ciqualError={ciqualError}
                offError={offError}
                onSelectProduct={handleProductSelect}
                onRecentSearchClick={searchWithDebounce}
              />
            </motion.div>
          )}

          {activeTab === 'voice' && (
            <motion.div
              key="voice"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <VoiceFoodInput
                mealType={mealType}
                onAddToMeal={(items) => {
                  setAddedItems((prev) => [...prev, ...items]);
                }}
              />
            </motion.div>
          )}

          {activeTab === 'ai' && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <AIMealGenerator
                mealType={mealType}
                onAddToMeal={(recipe) => {
                  // Convert AI recipe to MealItem
                  const foodItem: FoodItem = {
                    id: `ai-${Date.now()}`,
                    name: recipe.title,
                    serving: recipe.servings || 1,
                    servingUnit: 'portion',
                    nutrition: recipe.nutrition,
                    source: 'ai',
                  };
                  const mealItem: MealItem = {
                    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                    food: foodItem,
                    quantity: 1,
                    customServing: 1,
                  };
                  setAddedItems((prev) => [...prev, mealItem]);
                }}
              />
            </motion.div>
          )}

          {activeTab === 'photo' && (
            <motion.div
              key="photo"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <PhotoFoodScanner
                mealType={mealType}
                onFoodDetected={(foods: AnalyzedFood[], totalNutrition: NutritionInfo) => {
                  // Convert detected foods to MealItems
                  const newItems: MealItem[] = foods.map((food, index) => {
                    const foodItem: FoodItem = {
                      id: `scan-${Date.now()}-${index}`,
                      name: food.name,
                      serving: food.estimatedWeight,
                      servingUnit: 'g',
                      nutrition: food.nutrition,
                      source: 'ai',
                    };
                    return {
                      id: `${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`,
                      food: foodItem,
                      quantity: 1,
                      customServing: food.estimatedWeight,
                    };
                  });
                  setAddedItems((prev) => [...prev, ...newItems]);
                }}
              />
            </motion.div>
          )}

          {activeTab === 'barcode' && (
            <motion.div
              key="barcode"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center py-12"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mx-auto mb-4">
                <Barcode className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="font-semibold text-stone-700 mb-2">
                Scanner un code-barres
              </h3>
              <p className="text-sm text-stone-500 max-w-xs mx-auto">
                Scannez le code-barres d'un produit pour obtenir ses informations nutritionnelles.
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="mt-4 px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-medium"
              >
                Bientôt disponible
              </motion.button>
            </motion.div>
          )}

          {activeTab === 'recipes' && (
            <motion.div
              key="recipes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-stone-800">Vos recettes</h3>
                </div>
                <span className="text-xs text-stone-500">
                  {communityRecipes.length} recettes
                </span>
              </div>

              {/* Loading state */}
              {recipesLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
              )}

              {/* Empty state */}
              {!recipesLoading && communityRecipes.length === 0 && (
                <div className="text-center py-12 bg-white rounded-2xl">
                  <Users className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                  <p className="text-stone-600 font-medium">Aucune recette pour le moment</p>
                  <p className="text-stone-400 text-sm mt-1">
                    Proposez vos recettes depuis la page d'accueil !
                  </p>
                </div>
              )}

              {/* Recipe cards */}
              {!recipesLoading && communityRecipes.length > 0 && (
                <div className="space-y-3">
                  {communityRecipes.map((recipe) => (
                    <motion.div
                      key={recipe.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100"
                    >
                      <div className="flex">
                        {/* Image */}
                        <div
                          className="w-24 h-24 flex-shrink-0 bg-cover bg-center bg-gradient-to-br from-indigo-100 to-purple-100"
                          style={{
                            backgroundImage: recipe.imageUrl
                              ? `url(${recipe.imageUrl})`
                              : undefined,
                          }}
                        />

                        {/* Content */}
                        <div className="flex-1 p-3">
                          <h4 className="font-bold text-stone-900 text-sm line-clamp-1">
                            {recipe.title}
                          </h4>

                          {/* Author */}
                          {recipe.author && (
                            <p className="text-xs text-stone-400 mt-0.5">
                              par {recipe.author.name || 'Anonyme'}
                            </p>
                          )}

                          {/* Stats row */}
                          <div className="flex items-center gap-2 mt-2 text-xs text-stone-500">
                            <span className="flex items-center gap-0.5">
                              <Flame className="w-3 h-3 text-orange-500" />
                              {Math.round(recipe.calories)} kcal
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {recipe.prepTime} min
                            </span>
                            {recipe.ratingsCount > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                {recipe.averageRating.toFixed(1)}
                                <span className="text-stone-400">({recipe.ratingsCount})</span>
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => router.push(`/recipes/${recipe.id}`)}
                              className="flex-1 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1"
                            >
                              <MessageCircle className="w-3 h-3" />
                              Détails
                            </button>
                            <button
                              onClick={() => {
                                // Add recipe to meal
                                const foodItem: FoodItem = {
                                  id: `recipe-${recipe.id}`,
                                  name: recipe.title,
                                  serving: recipe.servings || 1,
                                  servingUnit: 'portion',
                                  nutrition: {
                                    calories: recipe.calories,
                                    proteins: recipe.proteins,
                                    carbs: recipe.carbs,
                                    fats: recipe.fats,
                                  },
                                  source: 'ai',
                                };
                                const mealItem: MealItem = {
                                  id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                                  food: foodItem,
                                  quantity: 1,
                                  customServing: 1,
                                };
                                setAddedItems((prev) => [...prev, mealItem]);
                              }}
                              className="flex-1 py-1.5 text-xs font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors flex items-center justify-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              Ajouter
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quantity Selector Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={() => setSelectedProduct(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg"
            >
              <QuantitySelector
                product={selectedProduct}
                onConfirm={handleQuantityConfirm}
                onCancel={() => setSelectedProduct(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Added Items Footer */}
      <AnimatePresence>
        {addedItems.length > 0 && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-4 z-30"
          >
            {/* Items preview */}
            <div className="flex items-center gap-3 mb-3 overflow-x-auto pb-2">
              {addedItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2 bg-stone-100 rounded-xl px-3 py-2 flex-shrink-0"
                >
                  <span className="text-sm font-medium text-stone-700 truncate max-w-[120px]">
                    {item.food.name}
                  </span>
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="w-5 h-5 rounded-full bg-stone-300 flex items-center justify-center text-stone-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              ))}
            </div>

            {/* Summary and save button */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-stone-500" />
                  <span className="text-sm text-stone-600">
                    {addedItems.length} aliment{addedItems.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-lg font-bold text-amber-600">
                  {Math.round(totalCalories)} kcal
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveMeal}
                className="px-8 py-3 bg-primary-600 text-white rounded-xl font-semibold shadow-lg"
              >
                Enregistrer
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AddMealPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-stone-50 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
        </div>
      }
    >
      <AddMealContent />
    </Suspense>
  );
}
