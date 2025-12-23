'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    ArrowLeft,
    Clock,
    Flame,
    Users,
    ChefHat,
    Star,
    Plus,
    Check,
} from 'lucide-react';
import { getRecipeWithRatings } from '@/app/actions/recipe';
import { addRecipeToMealPlan } from '@/app/actions/social-recipe';
import { RecipeRatingModal } from '@/components/features/recipes/RecipeRatingModal';

interface Ingredient {
    name: string;
    quantity: string;
    unit: string;
}

interface Recipe {
    id: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
    prepTime: number;
    cookTime: number | null;
    servings: number;
    difficulty: string | null;
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
    fiber: number | null;
    ingredients: Ingredient[];
    instructions: string[];
    tags: string[];
    averageRating: number;
    ratingsCount: number;
    source: string | null;
    videoUrl: string | null;
    videoPlatform: string | null;
    author?: {
        id: string;
        name: string | null;
        image: string | null;
    } | null;
}

export default function RecipeDetailPage() {
    const params = useParams();
    const router = useRouter();
    const recipeId = params.id as string;

    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [userRating, setUserRating] = useState<{ rating: number; comment: string | null; cooked: boolean } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showRatingModal, setShowRatingModal] = useState(false);
    const [addingToPlan, setAddingToPlan] = useState(false);
    const [addedToPlan, setAddedToPlan] = useState(false);

    useEffect(() => {
        async function fetchRecipe() {
            try {
                const result = await getRecipeWithRatings(recipeId);
                if (result.success && result.recipe) {
                    setRecipe(result.recipe as Recipe);
                    setUserRating(result.userRating || null);
                } else {
                    setError(result.error || 'Recette non trouvée');
                }
            } catch (err) {
                setError('Erreur lors du chargement');
            } finally {
                setIsLoading(false);
            }
        }

        fetchRecipe();
    }, [recipeId]);

    const handleAddToPlan = async () => {
        if (!recipe) return;

        setAddingToPlan(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const result = await addRecipeToMealPlan(recipe.id, today, 'lunch');
            if (result.success) {
                setAddedToPlan(true);
                setTimeout(() => setAddedToPlan(false), 3000);
            }
        } catch (err) {
            console.error('Error adding to plan:', err);
        } finally {
            setAddingToPlan(false);
        }
    };

    const getDifficultyLabel = (difficulty: string | null) => {
        switch (difficulty) {
            case 'easy':
                return 'Facile';
            case 'medium':
                return 'Moyen';
            case 'hard':
                return 'Difficile';
            default:
                return difficulty || 'Moyen';
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
        );
    }

    if (error || !recipe) {
        return (
            <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
                <p className="text-stone-600 mb-4">{error || 'Recette non trouvée'}</p>
                <button
                    onClick={() => router.back()}
                    className="text-primary-600 font-medium"
                >
                    Retour
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-50 pb-24">
            {/* Header with smaller image */}
            <div className="relative bg-gradient-to-br from-orange-100 to-rose-100 pt-14 pb-4 px-4">
                {/* Back Button */}
                <button
                    onClick={() => router.back()}
                    className="absolute top-4 left-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg z-10"
                >
                    <ArrowLeft className="w-5 h-5 text-stone-700" />
                </button>

                {/* Smaller centered image */}
                <div className="flex justify-center">
                    {recipe.imageUrl ? (
                        <div className="relative w-32 h-32 rounded-2xl overflow-hidden shadow-lg">
                            <img
                                src={recipe.imageUrl}
                                alt={recipe.title}
                                className="w-full h-full object-cover"
                            />
                            {/* Rating Badge */}
                            {recipe.ratingsCount > 0 && (
                                <div className="absolute bottom-1 right-1 px-2 py-0.5 bg-amber-500 text-white rounded-full flex items-center gap-1 shadow-lg">
                                    <Star className="w-3 h-3 fill-current" />
                                    <span className="text-xs font-medium">{recipe.averageRating.toFixed(1)}</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="w-32 h-32 rounded-2xl bg-white/50 flex items-center justify-center">
                            <ChefHat className="w-12 h-12 text-stone-300" />
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="px-4 mt-4 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl shadow-lg p-5"
                >
                    {/* Title & Description */}
                    <h1 className="text-xl font-bold text-stone-900 mb-2">{recipe.title}</h1>
                    {recipe.description && (
                        <p className="text-stone-600 text-sm mb-4">{recipe.description}</p>
                    )}

                    {/* Quick Stats */}
                    <div className="flex items-center gap-4 mb-6 text-sm">
                        <div className="flex items-center gap-1.5 text-orange-600">
                            <Flame className="w-4 h-4" />
                            <span className="font-medium">{recipe.calories} kcal</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-stone-600">
                            <Clock className="w-4 h-4" />
                            <span>{recipe.prepTime + (recipe.cookTime || 0)} min</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-stone-600">
                            <Users className="w-4 h-4" />
                            <span>{recipe.servings} pers.</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-stone-600">
                            <ChefHat className="w-4 h-4" />
                            <span>{getDifficultyLabel(recipe.difficulty)}</span>
                        </div>
                    </div>

                    {/* Nutrition */}
                    <div className="grid grid-cols-4 gap-3 mb-6">
                        <div className="bg-orange-50 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-orange-600">{recipe.calories}</p>
                            <p className="text-xs text-stone-500">kcal</p>
                        </div>
                        <div className="bg-red-50 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-red-600">{recipe.proteins}g</p>
                            <p className="text-xs text-stone-500">Protéines</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-amber-600">{recipe.carbs}g</p>
                            <p className="text-xs text-stone-500">Glucides</p>
                        </div>
                        <div className="bg-purple-50 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-purple-600">{recipe.fats}g</p>
                            <p className="text-xs text-stone-500">Lipides</p>
                        </div>
                    </div>

                    {/* Tags */}
                    {recipe.tags && recipe.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-6">
                            {recipe.tags.map((tag: string, index: number) => (
                                <span
                                    key={index}
                                    className="px-3 py-1 bg-stone-100 rounded-full text-xs text-stone-600"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Ingredients */}
                    <div className="mb-6">
                        <h2 className="text-lg font-semibold text-stone-900 mb-3">Ingrédients</h2>
                        <ul className="space-y-2">
                            {recipe.ingredients.map((ing: Ingredient, index: number) => (
                                <li key={index} className="flex items-center gap-3 text-sm">
                                    <span className="w-2 h-2 rounded-full bg-primary-500" />
                                    <span className="text-stone-700">
                                        <span className="font-medium">{ing.quantity} {ing.unit}</span> {ing.name}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Instructions */}
                    <div className="mb-6">
                        <h2 className="text-lg font-semibold text-stone-900 mb-3">Préparation</h2>
                        <ol className="space-y-4">
                            {recipe.instructions.map((step: string, index: number) => (
                                <li key={index} className="flex gap-3 text-sm">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 font-medium flex items-center justify-center text-xs">
                                        {index + 1}
                                    </span>
                                    <span className="text-stone-700 pt-0.5">{step}</span>
                                </li>
                            ))}
                        </ol>
                    </div>

                </motion.div>
            </div>

            {/* Fixed Bottom Actions */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-4 flex gap-3">
                <button
                    onClick={() => setShowRatingModal(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-stone-100 rounded-xl text-stone-700 font-medium"
                >
                    <Star className="w-5 h-5" />
                    {userRating ? 'Modifier mon avis' : 'Donner mon avis'}
                </button>
                <button
                    onClick={handleAddToPlan}
                    disabled={addingToPlan || addedToPlan}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-colors ${
                        addedToPlan
                            ? 'bg-green-500 text-white'
                            : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                >
                    {addedToPlan ? (
                        <>
                            <Check className="w-5 h-5" />
                            Ajouté !
                        </>
                    ) : (
                        <>
                            <Plus className="w-5 h-5" />
                            Ajouter au plan
                        </>
                    )}
                </button>
            </div>

            {/* Rating Modal */}
            <RecipeRatingModal
                isOpen={showRatingModal}
                recipeId={recipe.id}
                recipeTitle={recipe.title}
                existingRating={userRating ? {
                    rating: userRating.rating,
                    comment: userRating.comment,
                    cooked: userRating.cooked,
                } : undefined}
                onClose={() => setShowRatingModal(false)}
                onSuccess={() => {
                    // Refresh the page to get updated rating
                    window.location.reload();
                }}
            />
        </div>
    );
}
