'use server';

import { v2 as cloudinary } from 'cloudinary';
import { COACH_SYSTEM_PROMPT, MEAL_PLANNER_SYSTEM_PROMPT, MEAL_TYPE_GUIDELINES, IMAGE_GENERATION_PROMPT_TEMPLATE } from '@/lib/ai/prompts';
import { generateUserProfileContext } from '@/lib/ai/user-context';
import type { UserProfile } from '@/types/user';
import type { NutritionInfo } from '@/types/meal';

// Vertex AI SDK for image generation
import { v1 } from '@google-cloud/aiplatform';
import { helpers } from '@google-cloud/aiplatform';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Check if OpenAI is available
function isOpenAIAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
}

/**
 * Upload image to Cloudinary permanent storage
 * Downloads the temporary URL and stores it permanently
 */
async function uploadImageToStorage(tempUrl: string, filename: string): Promise<string | null> {
    try {
        // Check if Cloudinary is configured
        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
            console.warn('Cloudinary not configured, skipping image persistence');
            return null;
        }

        // Upload directly from URL to Cloudinary
        const result = await cloudinary.uploader.upload(tempUrl, {
            folder: 'lym-recipes',
            public_id: filename,
            resource_type: 'image',
            transformation: [
                { width: 1024, height: 1024, crop: 'limit' },
                { quality: 'auto:good' },
                { fetch_format: 'auto' }
            ]
        });

        console.log('Image uploaded to Cloudinary:', result.secure_url);
        return result.secure_url;
    } catch (error) {
        console.error('Error uploading image to Cloudinary:', error);
        return null;
    }
}

// Clean JSON from markdown code blocks
function cleanJsonResponse(text: string): string {
    return text.replace(/```json\n?|\n?```/g, "").trim();
}

/**
 * Call OpenAI Chat API
 */
async function callOpenAI(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    model: string = 'gpt-4o-mini',
    maxTokens: number = 2000,
    temperature: number = 0.7
): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('OpenAI API error:', response.status, errorData);
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
        throw new Error('No response from OpenAI');
    }

    return text;
}

/**
 * Chat with the AI coach
 */
export async function chatWithCoach(
    message: string,
    context?: {
        consumed?: NutritionInfo;
        targets?: NutritionInfo;
    },
    userProfile?: UserProfile
) {
    try {
        if (!isOpenAIAvailable()) {
            return {
                success: false,
                error: "L'IA n'est pas configurée. Veuillez configurer OPENAI_API_KEY."
            };
        }

        const profileContext = userProfile ? generateUserProfileContext(userProfile) : '';

        // Build nutrition context if available
        let nutritionContext = '';
        if (context?.consumed && context?.targets) {
            const remaining = {
                calories: Math.max(0, context.targets.calories - context.consumed.calories),
                proteins: Math.max(0, context.targets.proteins - context.consumed.proteins),
                carbs: Math.max(0, context.targets.carbs - context.consumed.carbs),
                fats: Math.max(0, context.targets.fats - context.consumed.fats),
            };

            nutritionContext = `
DONNÉES NUTRITIONNELLES AUJOURD'HUI:
- Calories: ${Math.round(context.consumed.calories)}/${context.targets.calories} kcal (reste: ${Math.round(remaining.calories)} kcal)
- Protéines: ${Math.round(context.consumed.proteins)}/${context.targets.proteins}g (reste: ${Math.round(remaining.proteins)}g)
- Glucides: ${Math.round(context.consumed.carbs)}/${context.targets.carbs}g (reste: ${Math.round(remaining.carbs)}g)
- Lipides: ${Math.round(context.consumed.fats)}/${context.targets.fats}g (reste: ${Math.round(remaining.fats)}g)
`;
        }

        const systemPrompt = `${COACH_SYSTEM_PROMPT}\n\n${profileContext}\n\n${nutritionContext}`;

        const response = await callOpenAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
        ], 'gpt-4o-mini', 1000, 0.7);

        return { success: true, message: response };
    } catch (error) {
        console.error("Error in chatWithCoach:", error);
        return { success: false, error: "Impossible d'obtenir une réponse du coach" };
    }
}

/**
 * Generate a single recipe based on request
 */
export async function generateRecipe(request: string, userProfile?: UserProfile) {
    try {
        if (!isOpenAIAvailable()) {
            return {
                success: false,
                error: "L'IA n'est pas configurée. Veuillez configurer OPENAI_API_KEY."
            };
        }

        const profileContext = userProfile ? generateUserProfileContext(userProfile) : '';

        const prompt = `
${MEAL_PLANNER_SYSTEM_PROMPT}

${profileContext}

Génère une recette détaillée pour : ${request}

IMPORTANT:
- La recette doit être simple et réalisable
- Ingrédients disponibles en supermarché
- Instructions claires étape par étape

Réponds UNIQUEMENT avec un JSON valide avec cette structure exacte:
{
  "title": "Nom du plat",
  "description": "Description courte et appétissante",
  "ingredients": [
    { "name": "ingrédient 1", "quantity": "200", "unit": "g" },
    { "name": "ingrédient 2", "quantity": "1", "unit": "pièce" }
  ],
  "instructions": ["étape 1", "étape 2", "étape 3"],
  "nutrition": {
    "calories": 500,
    "proteins": 30,
    "carbs": 40,
    "fats": 15,
    "fiber": 5,
    "sugar": 8,
    "sodium": 400
  },
  "prepTime": 15,
  "cookTime": 25,
  "servings": 2,
  "difficulty": "facile",
  "tags": ["healthy", "rapide", "économique"]
}
`;

        const response = await callOpenAI([
            { role: 'user', content: prompt }
        ], 'gpt-4o-mini', 2000, 0.3);

        const jsonStr = cleanJsonResponse(response);
        const recipe = JSON.parse(jsonStr);

        return { success: true, recipe };
    } catch (error) {
        console.error("Error in generateRecipe:", error);
        return { success: false, error: "Impossible de générer la recette" };
    }
}

/**
 * Suggest a recipe based on nutritional context
 */
export async function suggestRecipe(context: {
    consumed: NutritionInfo;
    targets: NutritionInfo;
    mealType: 'breakfast' | 'lunch' | 'snack' | 'dinner';
    userProfile?: UserProfile;
}) {
    try {
        if (!isOpenAIAvailable()) {
            return {
                success: false,
                error: "L'IA n'est pas configurée. Veuillez configurer OPENAI_API_KEY."
            };
        }

        const remaining = {
            calories: Math.max(0, context.targets.calories - context.consumed.calories),
            proteins: Math.max(0, context.targets.proteins - context.consumed.proteins),
            carbs: Math.max(0, context.targets.carbs - context.consumed.carbs),
            fats: Math.max(0, context.targets.fats - context.consumed.fats),
        };

        const profileContext = context.userProfile ? generateUserProfileContext(context.userProfile) : '';
        const mealGuidelines = MEAL_TYPE_GUIDELINES[context.mealType] || '';

        // Determine max prep time based on user profile
        const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
        const maxPrepTime = context.userProfile
            ? (isWeekend ? context.userProfile.cookingTimeWeekend : context.userProfile.cookingTimeWeekday) || 30
            : 30;

        const prompt = `
${MEAL_PLANNER_SYSTEM_PROMPT}

${profileContext}

${mealGuidelines}

CONTEXTE NUTRITIONNEL UTILISATEUR:
- Objectif journalier: ${context.targets.calories} kcal
- Déjà consommé: ${Math.round(context.consumed.calories)} kcal
- RESTE À CONSOMMER: ${Math.round(remaining.calories)} kcal

BESOINS EN MACROS RESTANTS:
- Protéines: ${Math.round(remaining.proteins)}g
- Glucides: ${Math.round(remaining.carbs)}g
- Lipides: ${Math.round(remaining.fats)}g

CONTRAINTES DE TEMPS:
- Temps de préparation maximum: ${maxPrepTime} minutes
- Jour: ${isWeekend ? 'Weekend (plus de temps disponible)' : 'Semaine (recette rapide préférée)'}

${context.userProfile?.cookingSkillLevel === 'beginner' ? 'NIVEAU DÉBUTANT: Proposer une recette simple avec peu d\'étapes et des techniques basiques.' : ''}
${context.userProfile?.dietType ? `RÉGIME: Respecter strictement le régime ${context.userProfile.dietType}.` : ''}
${context.userProfile?.allergies?.length ? `ALLERGIES: Éviter absolument: ${context.userProfile.allergies.join(', ')}.` : ''}

TÂCHE:
Génère une recette de ${context.mealType} qui aide à combler ces besoins restants, sans dépasser significativement les calories restantes.
La recette doit ABSOLUMENT respecter les habitudes françaises pour ce type de repas.

IMPORTANT: Pour un petit-déjeuner, NE JAMAIS proposer de plats salés complexes comme du saumon grillé, poisson, ou viandes en sauce.

Réponds UNIQUEMENT avec un JSON valide avec cette structure exacte:
{
  "title": "Nom du plat",
  "description": "Description courte",
  "ingredients": [
    { "name": "ingrédient 1", "quantity": "200", "unit": "g" }
  ],
  "instructions": ["étape 1", "étape 2"],
  "nutrition": {
    "calories": 500,
    "proteins": 30,
    "carbs": 40,
    "fats": 15,
    "fiber": 5,
    "sugar": 8,
    "sodium": 400
  },
  "prepTime": 20,
  "cookTime": 15,
  "servings": 1,
  "difficulty": "facile",
  "tags": ["healthy", "rapide"]
}
`;

        const response = await callOpenAI([
            { role: 'user', content: prompt }
        ], 'gpt-4o', 2000, 0.3);

        const jsonStr = cleanJsonResponse(response);
        const recipe = JSON.parse(jsonStr);

        return { success: true, recipe };
    } catch (error) {
        console.error("Error in suggestRecipe:", error);
        return { success: false, error: "Impossible de suggérer une recette" };
    }
}

/**
 * Check if Google Vertex AI is available for image generation
 */
function isVertexAIAvailable(): boolean {
    return !!process.env.GOOGLE_CLOUD_PROJECT &&
           (!!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !!process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

/**
 * Generate food image using Google Imagen 3 (more realistic) via official SDK
 * Falls back to DALL-E 3 if Vertex AI is not configured or fails
 * Uses the @google-cloud/aiplatform SDK for reliable authentication
 */
export async function generateFoodImage(description: string): Promise<{ success: boolean; image?: string; error?: string }> {
    try {
        const prompt = IMAGE_GENERATION_PROMPT_TEMPLATE(description);

        // Try Google Imagen 3 first (more realistic images)
        if (isVertexAIAvailable()) {
            try {
                console.log('Generating image with Google Imagen 3 (SDK):', prompt.substring(0, 100));

                const projectId = process.env.GOOGLE_CLOUD_PROJECT;
                const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

                // Initialize Vertex AI client with proper credentials
                const clientOptions: { apiEndpoint: string; credentials?: { client_email: string; private_key: string } } = {
                    apiEndpoint: `${location}-aiplatform.googleapis.com`,
                };

                // If GOOGLE_SERVICE_ACCOUNT_KEY is set, parse and use it
                if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
                    try {
                        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
                        clientOptions.credentials = {
                            client_email: credentials.client_email,
                            private_key: credentials.private_key,
                        };
                    } catch (parseError) {
                        console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', parseError);
                        throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY format');
                    }
                }

                const predictionServiceClient = new v1.PredictionServiceClient(clientOptions);

                const endpoint = `projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-generate-001`;

                const instance = { prompt };
                const instanceValue = helpers.toValue(instance);

                const parameters = {
                    sampleCount: 1,
                    aspectRatio: "1:1",
                    safetyFilterLevel: "block_some",
                    personGeneration: "allow_adult",
                };
                const parameterValue = helpers.toValue(parameters);

                // @ts-ignore - types for predict are complex
                const [response] = await predictionServiceClient.predict({
                    endpoint,
                    instances: [instanceValue as any],
                    parameters: parameterValue as any,
                });

                if (!response.predictions || response.predictions.length === 0) {
                    throw new Error("No image generated from Imagen 3");
                }

                const prediction = response.predictions?.[0];
                if (!prediction) {
                    throw new Error("No prediction found");
                }

                const predictionValue = helpers.fromValue(prediction as any);
                // @ts-ignore - bytesBase64Encoded exists on the response
                const base64Image = predictionValue?.bytesBase64Encoded;

                if (!base64Image) {
                    throw new Error("No image data in Imagen response");
                }

                console.log('Imagen 3 image generated successfully, persisting to storage...');

                // Generate unique filename
                const timestamp = Date.now();
                const descHash = description.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
                const filename = `${timestamp}-${descHash}`;

                // Convert base64 to data URL for upload
                const dataUrl = `data:image/png;base64,${base64Image}`;
                const permanentUrl = await uploadImageToStorage(dataUrl, filename);

                if (permanentUrl) {
                    console.log('Image persisted successfully:', permanentUrl);
                    return { success: true, image: permanentUrl };
                } else {
                    // Return as data URL if storage fails
                    return { success: true, image: dataUrl };
                }

            } catch (imagenError) {
                console.error('Imagen error, falling back to DALL-E:', imagenError);
                // Continue to DALL-E fallback
            }
        }

        // Fallback to DALL-E 3
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            console.log('No image generation API configured');
            return { success: false, error: "No image generation API configured" };
        }

        console.log('Falling back to DALL-E 3:', prompt.substring(0, 100));

        const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'dall-e-3',
                prompt: prompt,
                n: 1,
                size: '1024x1024',
                quality: 'standard',
                response_format: 'url',
            }),
        });

        if (!dalleResponse.ok) {
            const errorData = await dalleResponse.json().catch(() => ({}));
            console.error('DALL-E API error:', dalleResponse.status, errorData);
            return { success: false, error: `DALL-E error: ${dalleResponse.status}` };
        }

        const dalleData = await dalleResponse.json();
        const tempImageUrl = dalleData.data?.[0]?.url;

        if (!tempImageUrl) {
            console.error('No image URL in response:', dalleData);
            return { success: false, error: "No image URL in response" };
        }

        console.log('DALL-E image generated successfully, persisting to storage...');

        // Generate unique filename based on timestamp and description hash
        const timestamp = Date.now();
        const descHash = description.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        const filename = `${timestamp}-${descHash}`;

        // Upload to permanent storage
        const permanentUrl = await uploadImageToStorage(tempImageUrl, filename);

        if (permanentUrl) {
            console.log('Image persisted successfully:', permanentUrl);
            return { success: true, image: permanentUrl };
        } else {
            // Fallback to temp URL if storage fails (better than nothing)
            console.warn('Storage failed, returning temporary URL');
            return { success: true, image: tempImageUrl };
        }

    } catch (error) {
        console.error("Error in generateFoodImage:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to generate image" };
    }
}

/**
 * Generate detailed recipe from a meal plan item
 * Used when viewing recipe details in the weekly planner
 */
export async function generateRecipeDetails(meal: {
    name: string;
    description?: string;
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
    prepTime: number;
    type: string;
}, userProfile?: UserProfile) {
    try {
        if (!isOpenAIAvailable()) {
            return {
                success: false,
                error: "L'IA n'est pas configurée. Veuillez configurer OPENAI_API_KEY."
            };
        }

        const profileContext = userProfile ? generateUserProfileContext(userProfile) : '';

        const mealTypeLabels: Record<string, string> = {
            breakfast: 'petit-déjeuner',
            lunch: 'déjeuner',
            snack: 'collation',
            dinner: 'dîner'
        };

        const prompt = `
Tu es un chef cuisinier français expert. Tu dois créer une recette COMPLÈTE et DÉTAILLÉE.

${profileContext}

PLAT À PRÉPARER: "${meal.name}"
Description: ${meal.description || 'Plat savoureux et équilibré'}
Type de repas: ${mealTypeLabels[meal.type] || meal.type}
Temps de préparation: ${meal.prepTime} minutes maximum

OBJECTIFS NUTRITIONNELS (pour 1 personne):
- Calories: environ ${meal.calories} kcal
- Protéines: environ ${meal.proteins}g
- Glucides: environ ${meal.carbs}g
- Lipides: environ ${meal.fats}g

INSTRUCTIONS IMPORTANTES:
1. Liste TOUS les ingrédients avec quantités PRÉCISES (grammes, ml, pièces)
2. Minimum 5-8 ingrédients pour une recette complète
3. Instructions DÉTAILLÉES étape par étape (minimum 5 étapes)
4. Chaque étape doit être claire et actionnable
5. Ajoute 2-3 astuces de chef utiles
6. Les ingrédients doivent être disponibles en supermarché français

Réponds UNIQUEMENT avec ce JSON (pas de texte avant ou après):
{
  "ingredients": [
    { "name": "Poulet (filet)", "quantity": "150", "unit": "g" },
    { "name": "Huile d'olive", "quantity": "1", "unit": "c. à soupe" },
    { "name": "Ail", "quantity": "2", "unit": "gousses" },
    { "name": "Sel", "quantity": "1", "unit": "pincée" },
    { "name": "Poivre noir", "quantity": "1", "unit": "pincée" }
  ],
  "instructions": [
    "Sortir le poulet du réfrigérateur 15 minutes avant pour qu'il soit à température ambiante.",
    "Émincer finement l'ail et réserver.",
    "Faire chauffer l'huile d'olive dans une poêle à feu moyen-vif.",
    "Saisir le poulet 4-5 minutes de chaque côté jusqu'à coloration dorée.",
    "Ajouter l'ail, baisser le feu et cuire encore 2 minutes.",
    "Assaisonner de sel et poivre, laisser reposer 2 minutes avant de servir."
  ],
  "tips": [
    "Pour un poulet plus juteux, ne le coupez pas immédiatement après cuisson.",
    "Vous pouvez remplacer l'huile d'olive par du beurre pour plus de saveur.",
    "Accompagnez de riz basmati ou de légumes grillés."
  ]
}
`;

        const response = await callOpenAI([
            { role: 'user', content: prompt }
        ], 'gpt-4o', 2000, 0.3);

        const jsonStr = cleanJsonResponse(response);
        const recipe = JSON.parse(jsonStr);

        // Validate and ensure minimum content
        if (!recipe.ingredients || recipe.ingredients.length < 3) {
            throw new Error('Recette incomplète');
        }
        if (!recipe.instructions || recipe.instructions.length < 3) {
            throw new Error('Instructions incomplètes');
        }

        return { success: true, recipe };
    } catch (error) {
        console.error("Error in generateRecipeDetails:", error);
        return { success: false, error: "Impossible de générer les détails de la recette" };
    }
}

/**
 * Generate multiple recipe suggestions
 */
export async function generateRecipeSuggestions(
    count: number = 3,
    mealType: 'breakfast' | 'lunch' | 'snack' | 'dinner',
    userProfile?: UserProfile
) {
    try {
        if (!isOpenAIAvailable()) {
            return {
                success: false,
                error: "L'IA n'est pas configurée. Veuillez configurer OPENAI_API_KEY."
            };
        }

        const profileContext = userProfile ? generateUserProfileContext(userProfile) : '';
        const mealGuidelines = MEAL_TYPE_GUIDELINES[mealType] || '';

        const prompt = `
${MEAL_PLANNER_SYSTEM_PROMPT}

${profileContext}

${mealGuidelines}

Génère ${count} suggestions de recettes pour un ${mealType === 'breakfast' ? 'petit-déjeuner' : mealType === 'lunch' ? 'déjeuner' : mealType === 'snack' ? 'collation' : 'dîner'}.

IMPORTANT:
- Recettes variées et différentes
- Adaptées au profil utilisateur
- Simples et réalisables

Réponds UNIQUEMENT avec un JSON valide:
{
  "suggestions": [
    {
      "title": "Nom du plat",
      "description": "Description courte",
      "calories": 500,
      "proteins": 30,
      "carbs": 40,
      "fats": 15,
      "prepTime": 20,
      "difficulty": "facile",
      "tags": ["healthy", "rapide"]
    }
  ]
}
`;

        const response = await callOpenAI([
            { role: 'user', content: prompt }
        ], 'gpt-4o-mini', 2000, 0.5);

        const jsonStr = cleanJsonResponse(response);
        const data = JSON.parse(jsonStr);

        return { success: true, suggestions: data.suggestions || [] };
    } catch (error) {
        console.error("Error in generateRecipeSuggestions:", error);
        return { success: false, error: "Impossible de générer les suggestions" };
    }
}

/**
 * Types for proactive insights
 */
export type ProactiveInsightType = 'tip' | 'alert' | 'motivation' | 'achievement' | 'reminder' | 'trend';

export interface ProactiveInsight {
    type: ProactiveInsightType;
    priority: 'high' | 'medium' | 'low';
    title: string;
    message: string;
    action?: string;
    actionLink?: string;
    category: 'nutrition' | 'hydration' | 'weight' | 'habits' | 'goals' | 'social';
}

export interface WeeklyNutritionData {
    date: string;
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
    mealsLogged: number;
}

export interface UserContext {
    profile: UserProfile;
    todayNutrition: {
        consumed: NutritionInfo;
        targets: NutritionInfo;
    };
    weeklyData: WeeklyNutritionData[];
    weightTrend?: {
        current: number;
        weekAgo: number;
        monthAgo: number;
    };
    streakDays: number;
    lastMealTime?: string;
    hydrationToday?: number;
    hydrationGoal?: number;
}

/**
 * Generate proactive coach insights based on user data and habits
 * This analyzes patterns and generates personalized notifications
 */
export async function generateProactiveInsights(
    context: UserContext
): Promise<{ success: boolean; insights?: ProactiveInsight[]; error?: string }> {
    try {
        if (!isOpenAIAvailable()) {
            // Fallback to rule-based insights if AI is not available
            return { success: true, insights: generateRuleBasedInsights(context) };
        }

        const profileContext = generateUserProfileContext(context.profile);

        // Build weekly summary
        const weeklyStats = context.weeklyData.reduce(
            (acc, day) => ({
                avgCalories: acc.avgCalories + day.calories / context.weeklyData.length,
                avgProteins: acc.avgProteins + day.proteins / context.weeklyData.length,
                totalMeals: acc.totalMeals + day.mealsLogged,
                daysTracked: acc.daysTracked + (day.mealsLogged > 0 ? 1 : 0),
            }),
            { avgCalories: 0, avgProteins: 0, totalMeals: 0, daysTracked: 0 }
        );

        const today = context.todayNutrition;
        const caloriePercent = today.targets.calories > 0
            ? Math.round((today.consumed.calories / today.targets.calories) * 100)
            : 0;
        const proteinPercent = today.targets.proteins > 0
            ? Math.round((today.consumed.proteins / today.targets.proteins) * 100)
            : 0;

        const prompt = `Tu es un coach nutritionnel IA proactif et bienveillant. Analyse les données suivantes et génère 2-4 insights personnalisés et actionnables.

${profileContext}

DONNÉES AUJOURD'HUI:
- Calories: ${Math.round(today.consumed.calories)}/${today.targets.calories} kcal (${caloriePercent}%)
- Protéines: ${Math.round(today.consumed.proteins)}/${today.targets.proteins}g (${proteinPercent}%)
- Glucides: ${Math.round(today.consumed.carbs)}/${today.targets.carbs}g
- Lipides: ${Math.round(today.consumed.fats)}/${today.targets.fats}g
- Heure actuelle: ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
${context.lastMealTime ? `- Dernier repas: ${context.lastMealTime}` : ''}
${context.hydrationToday !== undefined ? `- Hydratation: ${context.hydrationToday}/${context.hydrationGoal || 2500}ml` : ''}

STATISTIQUES SEMAINE (${context.weeklyData.length} derniers jours):
- Moyenne calories: ${Math.round(weeklyStats.avgCalories)} kcal/jour
- Moyenne protéines: ${Math.round(weeklyStats.avgProteins)}g/jour
- Jours trackés: ${weeklyStats.daysTracked}/${context.weeklyData.length}
- Total repas enregistrés: ${weeklyStats.totalMeals}
- Streak actuel: ${context.streakDays} jours

${context.weightTrend ? `
ÉVOLUTION POIDS:
- Actuel: ${context.weightTrend.current}kg
- Il y a 1 semaine: ${context.weightTrend.weekAgo}kg (${context.weightTrend.current - context.weightTrend.weekAgo > 0 ? '+' : ''}${(context.weightTrend.current - context.weightTrend.weekAgo).toFixed(1)}kg)
- Il y a 1 mois: ${context.weightTrend.monthAgo}kg (${context.weightTrend.current - context.weightTrend.monthAgo > 0 ? '+' : ''}${(context.weightTrend.current - context.weightTrend.monthAgo).toFixed(1)}kg)
` : ''}

RÈGLES POUR LES INSIGHTS:
1. Sois encourageant, jamais culpabilisant
2. Propose des actions concrètes et réalisables
3. Personnalise selon l'heure de la journée
4. Célèbre les réussites (streak, objectifs atteints)
5. Anticipe les besoins (rappel collation, hydratation)
6. Détecte les tendances (baisse de motivation, écarts répétés)

TYPES D'INSIGHTS:
- tip: Conseil pratique
- alert: Attention nécessaire (jamais alarmiste)
- motivation: Encouragement
- achievement: Célébration d'une réussite
- reminder: Rappel utile
- trend: Observation d'une tendance

PRIORITÉS:
- high: À voir immédiatement
- medium: Important mais pas urgent
- low: Informatif

Réponds UNIQUEMENT avec un JSON valide:
{
  "insights": [
    {
      "type": "tip|alert|motivation|achievement|reminder|trend",
      "priority": "high|medium|low",
      "title": "Titre court (max 40 caractères)",
      "message": "Message personnalisé (max 150 caractères)",
      "action": "Texte du bouton d'action (optionnel)",
      "actionLink": "/chemin/vers/page (optionnel)",
      "category": "nutrition|hydration|weight|habits|goals|social"
    }
  ]
}`;

        const response = await callOpenAI([
            { role: 'user', content: prompt }
        ], 'gpt-4o-mini', 1500, 0.5);

        const jsonStr = cleanJsonResponse(response);
        const data = JSON.parse(jsonStr);

        // Combine AI insights with rule-based insights
        const ruleBasedInsights = generateRuleBasedInsights(context);
        const allInsights = [...(data.insights || []), ...ruleBasedInsights];

        // Remove duplicates based on similar titles
        const uniqueInsights = allInsights.reduce((acc: ProactiveInsight[], insight: ProactiveInsight) => {
            const isDuplicate = acc.some(
                (i) => i.title.toLowerCase().includes(insight.title.toLowerCase().slice(0, 10))
            );
            if (!isDuplicate) acc.push(insight);
            return acc;
        }, []);

        return { success: true, insights: uniqueInsights.slice(0, 5) };
    } catch (error) {
        console.error("Error in generateProactiveInsights:", error);
        // Fallback to rule-based insights
        return { success: true, insights: generateRuleBasedInsights(context) };
    }
}

/**
 * Generate rule-based insights without AI (fallback/supplement)
 */
function generateRuleBasedInsights(context: UserContext): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    const now = new Date();
    const hour = now.getHours();
    const today = context.todayNutrition;

    const caloriePercent = today.targets.calories > 0
        ? (today.consumed.calories / today.targets.calories) * 100
        : 0;
    const proteinPercent = today.targets.proteins > 0
        ? (today.consumed.proteins / today.targets.proteins) * 100
        : 0;

    // Morning reminder (7-10h)
    if (hour >= 7 && hour <= 10 && today.consumed.calories === 0) {
        insights.push({
            type: 'reminder',
            priority: 'medium',
            title: 'Petit-déjeuner',
            message: 'N\'oublie pas de prendre un bon petit-déjeuner pour bien démarrer la journée !',
            action: 'Ajouter mon petit-déj',
            actionLink: '/meals/add?type=breakfast',
            category: 'nutrition',
        });
    }

    // Lunch reminder (11h30-14h)
    if (hour >= 11 && hour <= 14 && caloriePercent < 30) {
        insights.push({
            type: 'reminder',
            priority: 'medium',
            title: 'Pause déjeuner',
            message: 'C\'est l\'heure du déjeuner ! Pense à faire une vraie pause.',
            action: 'Voir les recettes',
            actionLink: '/meals/add?tab=recipes',
            category: 'nutrition',
        });
    }

    // Snack reminder (15h-17h)
    if (hour >= 15 && hour <= 17 && caloriePercent >= 50 && caloriePercent < 75) {
        insights.push({
            type: 'tip',
            priority: 'low',
            title: 'Collation saine',
            message: 'Un petit creux ? Une collation équilibrée t\'aidera à tenir jusqu\'au dîner.',
            action: 'Idées collation',
            actionLink: '/meals/add?type=snack',
            category: 'nutrition',
        });
    }

    // Protein alert
    if (hour >= 18 && proteinPercent < 60 && caloriePercent > 70) {
        insights.push({
            type: 'alert',
            priority: 'high',
            title: 'Protéines insuffisantes',
            message: `Tu n'as atteint que ${Math.round(proteinPercent)}% de ton objectif protéines. Privilégie un dîner riche en protéines !`,
            action: 'Recettes protéinées',
            actionLink: '/meals/add?tab=recipes&filter=protein',
            category: 'nutrition',
        });
    }

    // Streak celebration
    if (context.streakDays > 0 && context.streakDays % 7 === 0) {
        insights.push({
            type: 'achievement',
            priority: 'high',
            title: `${context.streakDays} jours de streak !`,
            message: 'Incroyable ! Ta régularité est exemplaire. Continue comme ça !',
            category: 'habits',
        });
    }

    // Hydration reminder
    if (context.hydrationToday !== undefined && context.hydrationGoal) {
        const hydrationPercent = (context.hydrationToday / context.hydrationGoal) * 100;
        if (hour >= 14 && hydrationPercent < 50) {
            insights.push({
                type: 'reminder',
                priority: 'medium',
                title: 'Hydratation',
                message: `Tu n'as bu que ${Math.round(hydrationPercent)}% de ton objectif. Garde ta bouteille à portée de main !`,
                category: 'hydration',
            });
        }
    }

    // Weight trend
    if (context.weightTrend && context.profile.goal) {
        const weeklyChange = context.weightTrend.current - context.weightTrend.weekAgo;

        if (context.profile.goal === 'weight_loss' && weeklyChange < -0.3) {
            insights.push({
                type: 'motivation',
                priority: 'medium',
                title: 'Belle progression !',
                message: `Tu as perdu ${Math.abs(weeklyChange).toFixed(1)}kg cette semaine. Tu es sur la bonne voie !`,
                action: 'Voir mon évolution',
                actionLink: '/weight',
                category: 'weight',
            });
        } else if (context.profile.goal === 'muscle_gain' && weeklyChange > 0.2) {
            insights.push({
                type: 'motivation',
                priority: 'medium',
                title: 'Objectif en vue !',
                message: `+${weeklyChange.toFixed(1)}kg cette semaine. Ta prise de masse avance bien !`,
                action: 'Voir mon évolution',
                actionLink: '/weight',
                category: 'weight',
            });
        }
    }

    // Evening summary (20h-22h)
    if (hour >= 20 && hour <= 22 && caloriePercent >= 90 && caloriePercent <= 110) {
        insights.push({
            type: 'achievement',
            priority: 'low',
            title: 'Journée équilibrée',
            message: 'Bravo ! Tu as atteint tes objectifs nutritionnels aujourd\'hui.',
            category: 'goals',
        });
    }

    return insights;
}
