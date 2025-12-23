'use server';

import { FOOD_PHOTO_ANALYSIS_PROMPT, QUICK_FOOD_ANALYSIS_PROMPT } from '@/lib/ai/prompts';
import type { NutritionInfo } from '@/types/meal';

// Types for food analysis results
export interface AnalyzedFood {
    name: string;
    description: string;
    estimatedWeight: number;
    ingredients: string[];
    nutrition: NutritionInfo;
    confidence: number;
}

export interface FoodAnalysisResult {
    success: boolean;
    foods?: AnalyzedFood[];
    totalNutrition?: NutritionInfo;
    mealType?: 'breakfast' | 'lunch' | 'snack' | 'dinner';
    notes?: string;
    error?: string;
}

export interface QuickAnalysisResult {
    success: boolean;
    name?: string;
    description?: string;
    calories?: number;
    proteins?: number;
    carbs?: number;
    fats?: number;
    confidence?: number;
    error?: string;
}

// Check if OpenAI is available
function isOpenAIAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
}

// Clean JSON from markdown code blocks
function cleanJsonResponse(text: string): string {
    return text.replace(/```json\n?|\n?```/g, "").trim();
}

/**
 * Analyze a food photo using OpenAI GPT-4o Vision
 * Most accurate vision model for food recognition
 * Returns detailed nutritional information about the food in the image
 */
export async function analyzeFoodPhoto(
    imageBase64: string,
    mimeType: string = 'image/jpeg'
): Promise<FoodAnalysisResult> {
    try {
        if (!isOpenAIAvailable()) {
            return {
                success: false,
                error: "L'IA n'est pas configurée. Veuillez configurer OPENAI_API_KEY."
            };
        }

        // Handle data URL format
        let imageUrl: string;
        if (imageBase64.startsWith('data:')) {
            imageUrl = imageBase64;
        } else {
            // Add data URL prefix if not present
            const cleanMimeType = mimeType.includes('/') ? mimeType : `image/${mimeType}`;
            imageUrl = `data:${cleanMimeType};base64,${imageBase64}`;
        }

        console.log('Analyzing food photo with GPT-4o Vision...');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageUrl,
                                    detail: 'high'
                                }
                            },
                            {
                                type: 'text',
                                text: FOOD_PHOTO_ANALYSIS_PROMPT
                            }
                        ]
                    }
                ],
                max_tokens: 2000,
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('OpenAI API error:', response.status, errorData);
            return {
                success: false,
                error: `Erreur API: ${response.status}`
            };
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;

        if (!text) {
            throw new Error('No response from AI');
        }

        const jsonStr = cleanJsonResponse(text);
        const result = JSON.parse(jsonStr);

        if (!result.success) {
            return {
                success: false,
                error: result.error || "Impossible d'analyser cette image"
            };
        }

        console.log('Food analysis completed:', result.foods?.length, 'items detected');

        return {
            success: true,
            foods: result.foods,
            totalNutrition: result.totalNutrition,
            mealType: result.mealType,
            notes: result.notes
        };

    } catch (error) {
        console.error("Error in analyzeFoodPhoto:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Erreur lors de l'analyse de la photo"
        };
    }
}

/**
 * Quick food analysis for faster results using GPT-4o-mini
 * Returns simplified nutritional estimation
 */
export async function quickAnalyzeFoodPhoto(
    imageBase64: string,
    mimeType: string = 'image/jpeg'
): Promise<QuickAnalysisResult> {
    try {
        if (!isOpenAIAvailable()) {
            return {
                success: false,
                error: "L'IA n'est pas configurée."
            };
        }

        // Handle data URL format
        let imageUrl: string;
        if (imageBase64.startsWith('data:')) {
            imageUrl = imageBase64;
        } else {
            const cleanMimeType = mimeType.includes('/') ? mimeType : `image/${mimeType}`;
            imageUrl = `data:${cleanMimeType};base64,${imageBase64}`;
        }

        console.log('Quick analyzing food photo with GPT-4o-mini...');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageUrl,
                                    detail: 'low'
                                }
                            },
                            {
                                type: 'text',
                                text: QUICK_FOOD_ANALYSIS_PROMPT
                            }
                        ]
                    }
                ],
                max_tokens: 500,
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('OpenAI API error:', response.status, errorData);
            return {
                success: false,
                error: `Erreur API: ${response.status}`
            };
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;

        if (!text) {
            throw new Error('No response from AI');
        }

        const jsonStr = cleanJsonResponse(text);
        const result = JSON.parse(jsonStr);

        if (result.error) {
            return {
                success: false,
                error: result.error
            };
        }

        return {
            success: true,
            name: result.name,
            description: result.description,
            calories: result.calories,
            proteins: result.proteins,
            carbs: result.carbs,
            fats: result.fats,
            confidence: result.confidence
        };

    } catch (error) {
        console.error("Error in quickAnalyzeFoodPhoto:", error);
        return {
            success: false,
            error: "Erreur lors de l'analyse rapide"
        };
    }
}

/**
 * Analyze multiple food photos and combine results
 */
export async function analyzeMultipleFoodPhotos(
    images: Array<{ base64: string; mimeType?: string }>
): Promise<FoodAnalysisResult> {
    try {
        const results = await Promise.all(
            images.map(img => analyzeFoodPhoto(img.base64, img.mimeType || 'image/jpeg'))
        );

        // Combine all successful results
        const allFoods: AnalyzedFood[] = [];
        const notes: string[] = [];

        for (const result of results) {
            if (result.success && result.foods) {
                allFoods.push(...result.foods);
                if (result.notes) {
                    notes.push(result.notes);
                }
            }
        }

        if (allFoods.length === 0) {
            return {
                success: false,
                error: "Aucun aliment détecté dans les images"
            };
        }

        // Calculate total nutrition
        const totalNutrition: NutritionInfo = {
            calories: 0,
            proteins: 0,
            carbs: 0,
            fats: 0,
            fiber: 0,
            sugar: 0,
            sodium: 0
        };

        for (const food of allFoods) {
            totalNutrition.calories += food.nutrition.calories;
            totalNutrition.proteins += food.nutrition.proteins;
            totalNutrition.carbs += food.nutrition.carbs;
            totalNutrition.fats += food.nutrition.fats;
            totalNutrition.fiber = (totalNutrition.fiber || 0) + (food.nutrition.fiber || 0);
            totalNutrition.sugar = (totalNutrition.sugar || 0) + (food.nutrition.sugar || 0);
            totalNutrition.sodium = (totalNutrition.sodium || 0) + (food.nutrition.sodium || 0);
        }

        return {
            success: true,
            foods: allFoods,
            totalNutrition,
            notes: notes.length > 0 ? notes.join(' | ') : undefined
        };

    } catch (error) {
        console.error("Error in analyzeMultipleFoodPhotos:", error);
        return {
            success: false,
            error: "Erreur lors de l'analyse des photos"
        };
    }
}
