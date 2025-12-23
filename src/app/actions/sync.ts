'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// ============================================
// USER PROFILE SYNC
// ============================================

export interface UserProfileData {
    firstName?: string | null;
    lastName?: string | null;
    birthDate?: string | null;
    gender?: string | null;
    height?: number | null;
    weight?: number | null;
    targetWeight?: number | null;
    activityLevel?: string | null;
    goal?: string | null;
    dailyCaloriesTarget?: number | null;
    proteinTarget?: number | null;
    carbsTarget?: number | null;
    fatTarget?: number | null;
    dietType?: string | null;
    allergies?: string[];
    intolerances?: string[];
    dislikedFoods?: string[];
    likedFoods?: string[];
    cookingSkillLevel?: string | null;
    cookingTimeWeekday?: number | null;
    cookingTimeWeekend?: number | null;
    weeklyBudget?: number | null;
    fastingSchedule?: object | null;
    onboardingCompleted?: boolean;
    subscriptionPlan?: string;
}

/**
 * Save user profile to database
 */
export async function saveUserProfile(profile: UserProfileData) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                firstName: profile.firstName,
                lastName: profile.lastName,
                birthDate: profile.birthDate ? new Date(profile.birthDate) : null,
                gender: profile.gender,
                height: profile.height,
                weight: profile.weight,
                targetWeight: profile.targetWeight,
                activityLevel: profile.activityLevel,
                goal: profile.goal,
                dailyCaloriesTarget: profile.dailyCaloriesTarget,
                proteinTarget: profile.proteinTarget,
                carbsTarget: profile.carbsTarget,
                fatTarget: profile.fatTarget,
                dietType: profile.dietType,
                allergies: profile.allergies ? JSON.stringify(profile.allergies) : null,
                intolerances: profile.intolerances ? JSON.stringify(profile.intolerances) : null,
                dislikedFoods: profile.dislikedFoods ? JSON.stringify(profile.dislikedFoods) : null,
                likedFoods: profile.likedFoods ? JSON.stringify(profile.likedFoods) : null,
                cookingSkillLevel: profile.cookingSkillLevel,
                cookingTimeWeekday: profile.cookingTimeWeekday,
                cookingTimeWeekend: profile.cookingTimeWeekend,
                weeklyBudget: profile.weeklyBudget,
                fastingSchedule: profile.fastingSchedule ? JSON.stringify(profile.fastingSchedule) : null,
                onboardingCompleted: profile.onboardingCompleted ?? false,
                subscriptionPlan: profile.subscriptionPlan ?? 'free',
            },
        });

        return { success: true };
    } catch (error) {
        console.error('Error saving user profile:', error);
        return { success: false, error: 'Erreur lors de la sauvegarde' };
    }
}

/**
 * Load user profile from database
 */
export async function loadUserProfile() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
        });

        if (!user) {
            return { success: false, error: 'Utilisateur non trouvé' };
        }

        const profile: UserProfileData = {
            firstName: user.firstName,
            lastName: user.lastName,
            birthDate: user.birthDate?.toISOString().split('T')[0] || null,
            gender: user.gender,
            height: user.height,
            weight: user.weight,
            targetWeight: user.targetWeight,
            activityLevel: user.activityLevel,
            goal: user.goal,
            dailyCaloriesTarget: user.dailyCaloriesTarget,
            proteinTarget: user.proteinTarget,
            carbsTarget: user.carbsTarget,
            fatTarget: user.fatTarget,
            dietType: user.dietType,
            allergies: user.allergies ? JSON.parse(user.allergies) : [],
            intolerances: user.intolerances ? JSON.parse(user.intolerances) : [],
            dislikedFoods: user.dislikedFoods ? JSON.parse(user.dislikedFoods) : [],
            likedFoods: user.likedFoods ? JSON.parse(user.likedFoods) : [],
            cookingSkillLevel: user.cookingSkillLevel,
            cookingTimeWeekday: user.cookingTimeWeekday,
            cookingTimeWeekend: user.cookingTimeWeekend,
            weeklyBudget: user.weeklyBudget,
            fastingSchedule: user.fastingSchedule ? JSON.parse(user.fastingSchedule) : null,
            onboardingCompleted: user.onboardingCompleted,
            subscriptionPlan: user.subscriptionPlan,
        };

        return { success: true, profile };
    } catch (error) {
        console.error('Error loading user profile:', error);
        return { success: false, error: 'Erreur lors du chargement' };
    }
}

// ============================================
// MEALS SYNC
// ============================================

export interface MealItemData {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
    foodId?: string;
}

export interface MealData {
    id: string;
    type: string;
    date: string;
    time?: string;
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
    source: string;
    photoUrl?: string;
    notes?: string;
    isPlanned: boolean;
    items: MealItemData[];
}

/**
 * Save a single meal to database
 */
export async function saveMeal(meal: MealData) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        // Check if meal already exists
        const existingMeal = await prisma.meal.findFirst({
            where: {
                userId: session.user.id,
                date: meal.date,
                type: meal.type,
            },
        });

        if (existingMeal) {
            // Get existing items to calculate new totals
            const existingItems = await prisma.mealItem.findMany({
                where: { mealId: existingMeal.id },
            });

            // Calculate combined nutrition (existing + new items)
            const existingNutrition = existingItems.reduce(
                (acc, item) => ({
                    calories: acc.calories + (item.calories || 0),
                    proteins: acc.proteins + (item.proteins || 0),
                    carbs: acc.carbs + (item.carbs || 0),
                    fats: acc.fats + (item.fats || 0),
                }),
                { calories: 0, proteins: 0, carbs: 0, fats: 0 }
            );

            const newTotalNutrition = {
                calories: existingNutrition.calories + meal.calories,
                proteins: existingNutrition.proteins + meal.proteins,
                carbs: existingNutrition.carbs + meal.carbs,
                fats: existingNutrition.fats + meal.fats,
            };

            // Add new items to existing meal (don't delete existing items)
            await prisma.meal.update({
                where: { id: existingMeal.id },
                data: {
                    time: meal.time,
                    calories: newTotalNutrition.calories,
                    proteins: newTotalNutrition.proteins,
                    carbs: newTotalNutrition.carbs,
                    fats: newTotalNutrition.fats,
                    fiber: (existingMeal.fiber || 0) + (meal.fiber || 0),
                    sugar: (existingMeal.sugar || 0) + (meal.sugar || 0),
                    sodium: (existingMeal.sodium || 0) + (meal.sodium || 0),
                    source: meal.source,
                    photoUrl: meal.photoUrl || existingMeal.photoUrl,
                    notes: meal.notes || existingMeal.notes,
                    isPlanned: meal.isPlanned,
                    // Add new items without deleting existing ones
                    items: {
                        create: meal.items.map((item) => ({
                            name: item.name,
                            quantity: item.quantity,
                            unit: item.unit,
                            calories: item.calories,
                            proteins: item.proteins,
                            carbs: item.carbs,
                            fats: item.fats,
                            foodId: item.foodId,
                        })),
                    },
                },
            });

            return { success: true, mealId: existingMeal.id };
        } else {
            // Create new meal
            const newMeal = await prisma.meal.create({
                data: {
                    userId: session.user.id,
                    type: meal.type,
                    date: meal.date,
                    time: meal.time,
                    calories: meal.calories,
                    proteins: meal.proteins,
                    carbs: meal.carbs,
                    fats: meal.fats,
                    fiber: meal.fiber,
                    sugar: meal.sugar,
                    sodium: meal.sodium,
                    source: meal.source,
                    photoUrl: meal.photoUrl,
                    notes: meal.notes,
                    isPlanned: meal.isPlanned,
                    items: {
                        create: meal.items.map((item) => ({
                            name: item.name,
                            quantity: item.quantity,
                            unit: item.unit,
                            calories: item.calories,
                            proteins: item.proteins,
                            carbs: item.carbs,
                            fats: item.fats,
                            foodId: item.foodId,
                        })),
                    },
                },
            });

            return { success: true, mealId: newMeal.id };
        }
    } catch (error) {
        console.error('Error saving meal:', error);
        return { success: false, error: 'Erreur lors de la sauvegarde' };
    }
}

/**
 * Delete a meal from database
 */
export async function deleteMeal(date: string, mealType: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        await prisma.meal.deleteMany({
            where: {
                userId: session.user.id,
                date,
                type: mealType,
            },
        });

        return { success: true };
    } catch (error) {
        console.error('Error deleting meal:', error);
        return { success: false, error: 'Erreur lors de la suppression' };
    }
}

/**
 * Load meals for a date range from database
 */
export async function loadMeals(startDate: string, endDate: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        const meals = await prisma.meal.findMany({
            where: {
                userId: session.user.id,
                date: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            include: {
                items: true,
            },
            orderBy: {
                date: 'asc',
            },
        });

        const formattedMeals: MealData[] = meals.map((meal) => ({
            id: meal.id,
            type: meal.type,
            date: meal.date,
            time: meal.time || undefined,
            calories: meal.calories,
            proteins: meal.proteins,
            carbs: meal.carbs,
            fats: meal.fats,
            fiber: meal.fiber || undefined,
            sugar: meal.sugar || undefined,
            sodium: meal.sodium || undefined,
            source: meal.source,
            photoUrl: meal.photoUrl || undefined,
            notes: meal.notes || undefined,
            isPlanned: meal.isPlanned,
            items: meal.items.map((item) => ({
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                calories: item.calories,
                proteins: item.proteins,
                carbs: item.carbs,
                fats: item.fats,
                foodId: item.foodId || undefined,
            })),
        }));

        return { success: true, meals: formattedMeals };
    } catch (error) {
        console.error('Error loading meals:', error);
        return { success: false, error: 'Erreur lors du chargement' };
    }
}

/**
 * Load all user meals from database (for initial sync)
 */
export async function loadAllMeals() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        // Get meals from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];
        const endDate = new Date().toISOString().split('T')[0];

        return loadMeals(startDate, endDate);
    } catch (error) {
        console.error('Error loading all meals:', error);
        return { success: false, error: 'Erreur lors du chargement' };
    }
}

// ============================================
// FULL SYNC (Initial load when user logs in)
// ============================================

export async function syncAllUserData() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        // Load profile and meals in parallel
        const [profileResult, mealsResult] = await Promise.all([
            loadUserProfile(),
            loadAllMeals(),
        ]);

        return {
            success: true,
            profile: profileResult.success ? profileResult.profile : null,
            meals: mealsResult.success ? mealsResult.meals : [],
        };
    } catch (error) {
        console.error('Error syncing all user data:', error);
        return { success: false, error: 'Erreur lors de la synchronisation' };
    }
}
