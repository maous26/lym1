'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { awardXp, incrementStat, updateStreak } from './gamification';
import { XP_REWARDS } from '@/lib/gamification-utils';
import { generateFoodImage } from './ai';

// Check if OpenAI is available
function isOpenAIAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
}

/**
 * Call OpenAI Chat API
 */
async function callOpenAI(
    prompt: string,
    model: string = 'gpt-4o',
    maxTokens: number = 2000,
    temperature: number = 0.3
): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
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

// ============================================
// TYPES
// ============================================
type VideoPlatform = 'youtube' | 'instagram' | 'tiktok';

interface VideoInfo {
    platform: VideoPlatform;
    videoId: string;
    url: string;
    thumbnailUrl: string;
}

interface ExtractedRecipe {
    title: string;
    description: string;
    ingredients: Array<{ name: string; quantity: string; unit: string }>;
    instructions: string[];
    nutrition: {
        calories: number;
        proteins: number;
        carbs: number;
        fats: number;
        fiber?: number;
    };
    prepTime: number;
    cookTime: number;
    servings: number;
    difficulty: string;
    tags: string[];
}

// ============================================
// URL PARSING & VALIDATION
// ============================================

function parseVideoUrl(url: string): VideoInfo | null {
    // YouTube patterns
    const youtubePatterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of youtubePatterns) {
        const match = url.match(pattern);
        if (match) {
            return {
                platform: 'youtube',
                videoId: match[1],
                url: `https://www.youtube.com/watch?v=${match[1]}`,
                thumbnailUrl: `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`,
            };
        }
    }

    // Instagram patterns (reels, posts)
    const instagramPatterns = [
        /instagram\.com\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/,
    ];

    for (const pattern of instagramPatterns) {
        const match = url.match(pattern);
        if (match) {
            return {
                platform: 'instagram',
                videoId: match[1],
                url: `https://www.instagram.com/reel/${match[1]}/`,
                thumbnailUrl: '', // Instagram thumbnails require API access
            };
        }
    }

    // TikTok patterns
    const tiktokPatterns = [
        /tiktok\.com\/@[^\/]+\/video\/(\d+)/,
        /vm\.tiktok\.com\/([a-zA-Z0-9]+)/,
    ];

    for (const pattern of tiktokPatterns) {
        const match = url.match(pattern);
        if (match) {
            return {
                platform: 'tiktok',
                videoId: match[1],
                url,
                thumbnailUrl: '',
            };
        }
    }

    return null;
}

// ============================================
// TRANSCRIPT EXTRACTION
// ============================================

interface RapidAPITranscriptSegment {
    text: string;
    start: number;
    duration: number;
}

/**
 * Get YouTube transcript via RapidAPI (most reliable method)
 * Uses: https://rapidapi.com/8v2FWW4H6AmKw89/api/youtube-transcripts
 */
async function getYouTubeTranscriptViaRapidAPI(videoId: string): Promise<string | null> {
    const apiKey = process.env.RAPIDAPI_KEY;

    if (!apiKey) {
        console.log('RapidAPI key not configured');
        return null;
    }

    console.log('Fetching transcript via RapidAPI for video:', videoId);

    try {
        const url = `https://youtube-transcripts.p.rapidapi.com/youtube/transcript?videoId=${videoId}&chunkSize=500`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': 'youtube-transcripts.p.rapidapi.com',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log('RapidAPI error:', response.status, errorText);
            return null;
        }

        const data = await response.json();
        console.log('RapidAPI response structure:', Object.keys(data));

        // Handle different response formats
        let transcript = '';

        if (data.content && Array.isArray(data.content)) {
            // Format: { content: [{ text: "...", start: 0, duration: 5 }, ...] }
            transcript = data.content
                .map((segment: RapidAPITranscriptSegment) => segment.text)
                .join(' ');
        } else if (data.transcript && typeof data.transcript === 'string') {
            // Format: { transcript: "full text..." }
            transcript = data.transcript;
        } else if (Array.isArray(data)) {
            // Format: [{ text: "...", start: 0, duration: 5 }, ...]
            transcript = data
                .map((segment: RapidAPITranscriptSegment) => segment.text)
                .join(' ');
        } else if (data.text) {
            // Format: { text: "full text..." }
            transcript = data.text;
        }

        if (transcript && transcript.length > 50) {
            console.log('Got transcript via RapidAPI:', transcript.length, 'chars');
            console.log('Preview:', transcript.substring(0, 300));
            return transcript;
        }

        console.log('RapidAPI returned empty or short transcript');
        return null;
    } catch (error) {
        console.error('RapidAPI fetch error:', error);
        return null;
    }
}

async function getYouTubeTranscript(videoId: string): Promise<string | null> {
    console.log('Fetching transcript for video:', videoId);

    // Method 0: Try RapidAPI first (most reliable - can access auto-generated captions)
    try {
        const rapidAPITranscript = await getYouTubeTranscriptViaRapidAPI(videoId);
        if (rapidAPITranscript && rapidAPITranscript.length >= 50) {
            return rapidAPITranscript;
        }
    } catch (e) {
        console.log('RapidAPI failed:', (e as Error).message);
    }

    // Method 1: Try youtube-captions-scraper
    try {
        const { getSubtitles } = await import('youtube-captions-scraper');

        // Try French first
        const languages = ['fr', 'en', 'auto'];
        for (const lang of languages) {
            try {
                console.log(`Trying youtube-captions-scraper with lang: ${lang}`);
                const subtitles = await getSubtitles({
                    videoID: videoId,
                    lang: lang === 'auto' ? undefined : lang,
                });

                if (subtitles && subtitles.length > 0) {
                    const fullText = subtitles.map((s: { text: string }) => s.text).join(' ');
                    console.log(`Got transcript via captions-scraper (${lang}):`, fullText.length, 'chars');
                    console.log('Preview:', fullText.substring(0, 300));

                    if (fullText.length >= 50) {
                        return fullText;
                    }
                }
            } catch (langError) {
                console.log(`No ${lang} captions via scraper:`, (langError as Error).message);
            }
        }
    } catch (scraperError) {
        console.log('youtube-captions-scraper failed:', (scraperError as Error).message);
    }

    // Method 2: Fallback to youtube-transcript
    try {
        const { YoutubeTranscript } = await import('youtube-transcript');

        const languages = ['fr', undefined]; // Try French, then default
        for (const lang of languages) {
            try {
                console.log(`Trying youtube-transcript with lang: ${lang || 'default'}`);
                const options = lang ? { lang } : {};
                const transcript = await YoutubeTranscript.fetchTranscript(videoId, options);

                if (transcript && transcript.length > 0) {
                    const fullText = transcript.map((t: { text: string }) => t.text).join(' ');
                    console.log(`Got transcript via youtube-transcript (${lang || 'default'}):`, fullText.length, 'chars');
                    console.log('Preview:', fullText.substring(0, 300));

                    if (fullText.length >= 50) {
                        return fullText;
                    }
                }
            } catch (langError) {
                console.log(`No ${lang || 'default'} transcript:`, (langError as Error).message);
            }
        }
    } catch (ytError) {
        console.log('youtube-transcript failed:', (ytError as Error).message);
    }

    // Method 3: Try to fetch directly from YouTube page (scraping)
    try {
        console.log('Trying direct YouTube page scrape...');
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });

        const html = await response.text();
        console.log('Fetched YouTube page, length:', html.length);

        // Try to extract captions URL from the page - improved regex
        // The format is "captionTracks":[{...}] with escaped URLs
        const captionsMatch = html.match(/"captionTracks":\s*(\[[\s\S]*?\])\s*,\s*"/);
        if (captionsMatch) {
            console.log('Found caption tracks in page');
            try {
                // Parse the JSON, handling escaped characters
                const captionsJson = captionsMatch[1]
                    .replace(/\\u0026/g, '&')
                    .replace(/\\"/g, '"');
                const captionsData = JSON.parse(captionsJson);
                console.log('Parsed captions data, found', captionsData.length, 'tracks');

                // Find French or auto-generated captions
                const frCaptions = captionsData.find((c: any) =>
                    c.languageCode === 'fr' || c.vssId?.includes('.fr') || c.kind === 'asr'
                );

                if (frCaptions?.baseUrl) {
                    // Unescape the URL
                    const captionUrl = frCaptions.baseUrl.replace(/\\u0026/g, '&');
                    console.log('Fetching captions from URL...');

                    const captionsResponse = await fetch(captionUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        },
                    });
                    const captionsXml = await captionsResponse.text();
                    console.log('Got captions XML, length:', captionsXml.length);

                    // Parse XML to extract text - handle both formats
                    const textMatches = captionsXml.match(/<text[^>]*>([^<]*)<\/text>/g);
                    if (textMatches && textMatches.length > 0) {
                        const fullText = textMatches
                            .map((t: string) => {
                                const match = t.match(/<text[^>]*>([^<]*)<\/text>/);
                                if (!match) return '';
                                return match[1]
                                    .replace(/&amp;/g, '&')
                                    .replace(/&#39;/g, "'")
                                    .replace(/&quot;/g, '"')
                                    .replace(/&lt;/g, '<')
                                    .replace(/&gt;/g, '>')
                                    .replace(/\n/g, ' ');
                            })
                            .join(' ')
                            .replace(/\s+/g, ' ')
                            .trim();

                        console.log('Got transcript via direct scrape:', fullText.length, 'chars');
                        console.log('Preview:', fullText.substring(0, 300));

                        if (fullText.length >= 50) {
                            return fullText;
                        }
                    } else {
                        console.log('No text matches found in captions XML');
                        console.log('XML preview:', captionsXml.substring(0, 500));
                    }
                } else {
                    console.log('No French/ASR captions found in tracks');
                }
            } catch (parseError) {
                console.log('Error parsing captions JSON:', (parseError as Error).message);
            }
        } else {
            console.log('No captionTracks found in page');
            // Try alternative pattern
            const altMatch = html.match(/captionTracks.*?baseUrl.*?"([^"]+)"/);
            if (altMatch) {
                console.log('Found alternative caption URL pattern');
            }
        }
    } catch (scrapeError) {
        console.log('Direct scrape failed:', (scrapeError as Error).message);
    }

    console.log('All transcript methods failed for video:', videoId);
    return null;
}

async function getInstagramContent(videoId: string): Promise<string> {
    // Instagram doesn't have a public transcript API
    // We'll use Gemini to describe what we can get from the page
    // For now, we'll prompt the user to describe the recipe
    throw new Error('Instagram: veuillez copier la description de la recette dans le champ ci-dessous.');
}

// ============================================
// AI RECIPE EXTRACTION
// ============================================

function cleanJsonResponse(text: string): string {
    // Remove markdown code blocks
    let cleaned = text.replace(/```json\n?|\n?```/g, '').trim();

    // Try to extract JSON if there's extra text around it
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        cleaned = jsonMatch[0];
    }

    return cleaned;
}

async function extractRecipeFromTranscript(transcript: string, videoUrl: string): Promise<ExtractedRecipe> {
    if (!isOpenAIAvailable()) {
        throw new Error("L'IA n'est pas configurée");
    }

    // Light cleaning - only remove control characters, keep all letters (including international)
    const cleanedTranscript = transcript
        .substring(0, 15000)
        .replace(/[\x00-\x1F\x7F]/g, ' ') // Remove control characters only
        .replace(/\s+/g, ' ')
        .trim();

    // Log for debugging
    console.log('Cleaned transcript length:', cleanedTranscript.length);
    console.log('Cleaned transcript preview:', cleanedTranscript.substring(0, 300));

    const prompt = `Tu es un assistant culinaire expert. Analyse ce transcript de vidéo YouTube et extrais la recette EXACTE qui y est présentée.

TRANSCRIPT DE LA VIDÉO:
"""
${cleanedTranscript}
"""

RÈGLES STRICTES:
1. TITRE: Utilise le nom de la recette mentionné dans le transcript. Si pas de nom explicite, crée un titre basé sur le plat principal décrit.
2. INGRÉDIENTS: Liste UNIQUEMENT les ingrédients mentionnés dans le transcript avec leurs quantités.
3. INSTRUCTIONS: Extrais les étapes de préparation TELLES QUE décrites dans la vidéo.
4. NUTRITION: Calcule basé sur les ingrédients réels mentionnés.
5. NE PAS INVENTER: Si une information n'est pas dans le transcript, mets une valeur raisonnable mais basée sur le contexte du transcript.

IMPORTANT: La recette doit correspondre AU CONTENU DU TRANSCRIPT, pas à une recette générique.

Réponds UNIQUEMENT avec ce JSON:

{
  "title": "Nom descriptif de la recette",
  "description": "Description courte et appétissante",
  "ingredients": [
    { "name": "ingredient", "quantity": "100", "unit": "g" }
  ],
  "instructions": [
    "Étape 1",
    "Étape 2"
  ],
  "nutrition": {
    "calories": 400,
    "proteins": 20,
    "carbs": 40,
    "fats": 15,
    "fiber": 5
  },
  "prepTime": 15,
  "cookTime": 20,
  "servings": 4,
  "difficulty": "facile",
  "tags": ["tag1", "tag2"]
}`;

    const text = await callOpenAI(prompt, 'gpt-4o', 2000, 0.3);

    const jsonStr = cleanJsonResponse(text);

    // Validate it's actually JSON before parsing
    if (!jsonStr.startsWith('{')) {
        console.error('AI response is not JSON:', text.substring(0, 200));
        throw new Error('L\'IA n\'a pas pu analyser cette vidéo. Essayez avec une autre vidéo de recette.');
    }

    try {
        return JSON.parse(jsonStr);
    } catch (parseError) {
        console.error('JSON parse error:', parseError, 'Response:', jsonStr.substring(0, 500));
        throw new Error('Erreur lors de l\'analyse de la recette. Essayez avec une autre vidéo.');
    }
}

// ============================================
// MAIN ACTIONS
// ============================================

/**
 * Extract recipe from video URL WITHOUT saving (preview step)
 */
export async function extractVideoRecipe(videoUrl: string, manualDescription?: string): Promise<{
    success: boolean;
    extractedRecipe?: ExtractedRecipe & { videoInfo: VideoInfo };
    error?: string;
}> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        // Parse and validate URL
        const videoInfo = parseVideoUrl(videoUrl);
        if (!videoInfo) {
            return { success: false, error: 'URL non valide. Formats supportés: YouTube, Instagram Reels, TikTok' };
        }

        // Check if recipe from this video already exists
        const existingRecipe = await prisma.recipe.findFirst({
            where: {
                videoId: videoInfo.videoId,
                videoPlatform: videoInfo.platform,
            },
        });

        if (existingRecipe) {
            return { success: false, error: 'Cette vidéo a déjà été soumise !' };
        }

        // Get transcript based on platform
        let transcript: string | null = null;

        if (videoInfo.platform === 'youtube') {
            transcript = await getYouTubeTranscript(videoInfo.videoId);
        }

        // Use manual description if provided (takes priority)
        if (manualDescription && manualDescription.trim().length > 0) {
            transcript = manualDescription;
        }

        // If no transcript available, ask for manual description
        if (!transcript || transcript.length < 50) {
            return {
                success: false,
                error: 'NEED_DESCRIPTION', // Special code to trigger description field
            };
        }

        // Extract recipe using AI (without saving)
        const extractedRecipe = await extractRecipeFromTranscript(transcript, videoUrl);

        return {
            success: true,
            extractedRecipe: {
                ...extractedRecipe,
                videoInfo,
            },
        };
    } catch (error) {
        console.error('Error extracting video recipe:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Erreur lors de l\'extraction de la recette'
        };
    }
}

/**
 * Save a validated/edited recipe
 */
export async function saveValidatedRecipe(
    recipeData: ExtractedRecipe,
    videoInfo: { platform: VideoPlatform; videoId: string; url: string }
): Promise<{
    success: boolean;
    recipe?: any;
    recipeId?: string;
    xpEarned?: number;
    error?: string;
}> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        // Generate AI image for the recipe
        let generatedImageUrl: string | null = null;
        try {
            const imagePrompt = `${recipeData.title}: ${recipeData.description}`;
            console.log('Generating image for recipe:', imagePrompt.substring(0, 100));
            const imageResult = await generateFoodImage(imagePrompt);
            console.log('Image generation result:', imageResult.success, imageResult.error || 'no error');
            if (imageResult.success && imageResult.image) {
                generatedImageUrl = imageResult.image;
                console.log('Generated image URL length:', generatedImageUrl.length);
            }
        } catch (imageError) {
            console.error('Could not generate image for recipe:', imageError);
        }

        // Save to database
        const savedRecipe = await prisma.recipe.create({
            data: {
                title: recipeData.title,
                description: recipeData.description,
                imageUrl: generatedImageUrl,
                prepTime: recipeData.prepTime,
                cookTime: recipeData.cookTime,
                servings: recipeData.servings,
                difficulty: recipeData.difficulty,
                calories: recipeData.nutrition.calories,
                proteins: recipeData.nutrition.proteins,
                carbs: recipeData.nutrition.carbs,
                fats: recipeData.nutrition.fats,
                fiber: recipeData.nutrition.fiber,
                ingredients: JSON.stringify(recipeData.ingredients),
                instructions: JSON.stringify(recipeData.instructions),
                tags: JSON.stringify(recipeData.tags),
                source: videoInfo.platform,
                generatedBy: 'gemini',
                videoUrl: videoInfo.url,
                videoId: videoInfo.videoId,
                thumbnailUrl: null,
                videoPlatform: videoInfo.platform,
                authorId: session.user.id,
                status: 'approved',
            },
        });

        // Award XP for submission
        const xpResult = await awardXp(
            session.user.id,
            XP_REWARDS.submit_video_recipe || 50,
            'submit_video_recipe',
            savedRecipe.id,
            'recipe'
        );

        // Update streak
        await updateStreak(session.user.id);

        return {
            success: true,
            recipe: {
                ...savedRecipe,
                ingredients: recipeData.ingredients,
                instructions: recipeData.instructions,
                tags: recipeData.tags,
            },
            recipeId: savedRecipe.id,
            xpEarned: xpResult.xpAwarded,
        };
    } catch (error) {
        console.error('Error saving validated recipe:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Erreur lors de la sauvegarde'
        };
    }
}

/**
 * Submit a video URL and extract the recipe (legacy - kept for compatibility)
 */
export async function submitVideoRecipe(videoUrl: string, manualDescription?: string): Promise<{
    success: boolean;
    recipe?: any;
    recipeId?: string;
    xpEarned?: number;
    error?: string;
}> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        // Parse and validate URL
        const videoInfo = parseVideoUrl(videoUrl);
        if (!videoInfo) {
            return { success: false, error: 'URL non valide. Formats supportés: YouTube, Instagram Reels, TikTok' };
        }

        // Check if recipe from this video already exists
        const existingRecipe = await prisma.recipe.findFirst({
            where: {
                videoId: videoInfo.videoId,
                videoPlatform: videoInfo.platform,
            },
        });

        if (existingRecipe) {
            return { success: false, error: 'Cette vidéo a déjà été soumise !' };
        }

        // Get transcript based on platform
        let transcript: string | null = null;

        if (videoInfo.platform === 'youtube') {
            transcript = await getYouTubeTranscript(videoInfo.videoId);
        }

        // Use manual description if provided or if transcript not available
        if (manualDescription && manualDescription.trim().length > 0) {
            transcript = manualDescription;
        }

        if (!transcript || transcript.length < 50) {
            return {
                success: false,
                error: 'Impossible de récupérer les sous-titres. Veuillez ajouter une description de la recette.'
            };
        }

        // Extract recipe using AI
        const extractedRecipe = await extractRecipeFromTranscript(transcript, videoUrl);

        // Generate AI image for the recipe (no YouTube thumbnail for copyright)
        let generatedImageUrl: string | null = null;
        try {
            const imagePrompt = `${extractedRecipe.title}: ${extractedRecipe.description}`;
            const imageResult = await generateFoodImage(imagePrompt);
            if (imageResult.success && imageResult.image) {
                generatedImageUrl = imageResult.image;
            }
        } catch (imageError) {
            console.warn('Could not generate image for recipe:', imageError);
            // Continue without image - not critical
        }

        // Save to database
        const savedRecipe = await prisma.recipe.create({
            data: {
                title: extractedRecipe.title,
                description: extractedRecipe.description,
                imageUrl: generatedImageUrl,
                prepTime: extractedRecipe.prepTime,
                cookTime: extractedRecipe.cookTime,
                servings: extractedRecipe.servings,
                difficulty: extractedRecipe.difficulty,
                calories: extractedRecipe.nutrition.calories,
                proteins: extractedRecipe.nutrition.proteins,
                carbs: extractedRecipe.nutrition.carbs,
                fats: extractedRecipe.nutrition.fats,
                fiber: extractedRecipe.nutrition.fiber,
                ingredients: JSON.stringify(extractedRecipe.ingredients),
                instructions: JSON.stringify(extractedRecipe.instructions),
                tags: JSON.stringify(extractedRecipe.tags),
                source: videoInfo.platform,
                generatedBy: 'gemini',
                videoUrl: videoInfo.url,
                videoId: videoInfo.videoId,
                thumbnailUrl: null, // No YouTube thumbnail for copyright reasons
                videoPlatform: videoInfo.platform,
                transcript: transcript.substring(0, 10000), // Limit storage
                authorId: session.user.id,
                status: 'approved', // Auto-approve for MVP
            },
        });

        // Award XP for submission
        const xpResult = await awardXp(
            session.user.id,
            XP_REWARDS.submit_video_recipe || 50,
            'submit_video_recipe',
            savedRecipe.id,
            'recipe'
        );

        // Update streak
        await updateStreak(session.user.id);

        return {
            success: true,
            recipe: {
                ...savedRecipe,
                ingredients: extractedRecipe.ingredients,
                instructions: extractedRecipe.instructions,
                tags: extractedRecipe.tags,
            },
            recipeId: savedRecipe.id,
            xpEarned: xpResult.xpAwarded,
        };
    } catch (error) {
        console.error('Error submitting video recipe:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Erreur lors de l\'extraction de la recette'
        };
    }
}

/**
 * Get community recipes filtered by user profile
 */
export async function getCommunityRecipes(options?: {
    limit?: number;
    offset?: number;
    excludeUserAllergies?: boolean;
}): Promise<{
    success: boolean;
    recipes?: any[];
    total?: number;
    error?: string;
}> {
    const session = await getServerSession(authOptions);
    const limit = options?.limit || 10;
    const offset = options?.offset || 0;

    try {
        // Get user allergies if filtering requested
        let excludeTags: string[] = [];
        if (session?.user?.id && options?.excludeUserAllergies) {
            const user = await prisma.user.findUnique({
                where: { id: session.user.id },
                select: { allergies: true, intolerances: true },
            });
            if (user?.allergies) {
                excludeTags = JSON.parse(user.allergies);
            }
        }

        // Query recipes
        const [recipes, total] = await Promise.all([
            prisma.recipe.findMany({
                where: {
                    source: { in: ['youtube', 'instagram', 'tiktok', 'community'] },
                    status: 'approved',
                },
                orderBy: [
                    { averageRating: 'desc' },
                    { ratingsCount: 'desc' },
                    { createdAt: 'desc' },
                ],
                take: limit,
                skip: offset,
                include: {
                    author: {
                        select: { id: true, name: true, image: true },
                    },
                },
            }),
            prisma.recipe.count({
                where: {
                    source: { in: ['youtube', 'instagram', 'tiktok', 'community'] },
                    status: 'approved',
                },
            }),
        ]);

        // Parse JSON fields and filter by allergies
        const parsedRecipes = recipes
            .map((r) => ({
                ...r,
                ingredients: JSON.parse(r.ingredients),
                instructions: JSON.parse(r.instructions),
                tags: r.tags ? JSON.parse(r.tags) : [],
            }))
            .filter((r) => {
                if (excludeTags.length === 0) return true;
                // Check if recipe contains allergens
                const recipeTags = r.tags.map((t: string) => t.toLowerCase());
                const ingredientNames = r.ingredients.map((i: any) => i.name.toLowerCase()).join(' ');
                return !excludeTags.some(
                    (allergen) =>
                        recipeTags.includes(allergen.toLowerCase()) ||
                        ingredientNames.includes(allergen.toLowerCase())
                );
            });

        return { success: true, recipes: parsedRecipes, total };
    } catch (error) {
        console.error('Error getting community recipes:', error);
        return { success: false, error: 'Erreur lors de la récupération des recettes' };
    }
}

/**
 * Get top rated community recipes for homepage
 */
export async function getTopCommunityRecipes(limit: number = 5): Promise<{
    success: boolean;
    recipes?: any[];
    error?: string;
}> {
    const session = await getServerSession(authOptions);

    try {
        // Get user preferences for filtering
        let userPrefs: { allergies: string | null; dietType: string | null } | null = null;
        if (session?.user?.id) {
            userPrefs = await prisma.user.findUnique({
                where: { id: session.user.id },
                select: { allergies: true, dietType: true },
            });
        }

        const recipes = await prisma.recipe.findMany({
            where: {
                source: { in: ['youtube', 'instagram', 'tiktok', 'community'] },
                status: 'approved',
                ratingsCount: { gte: 0 }, // Include all for now, can increase threshold later
            },
            orderBy: [
                { averageRating: 'desc' },
                { ratingsCount: 'desc' },
            ],
            take: limit * 2, // Get extra for filtering
            include: {
                author: {
                    select: { id: true, name: true, image: true },
                },
            },
        });

        // Parse and filter
        let parsedRecipes = recipes.map((r) => ({
            ...r,
            ingredients: JSON.parse(r.ingredients),
            instructions: JSON.parse(r.instructions),
            tags: r.tags ? JSON.parse(r.tags) : [],
        }));

        // Filter by user allergies
        if (userPrefs?.allergies) {
            const allergies = JSON.parse(userPrefs.allergies).map((a: string) => a.toLowerCase());
            parsedRecipes = parsedRecipes.filter((r) => {
                const ingredientText = r.ingredients.map((i: any) => i.name.toLowerCase()).join(' ');
                return !allergies.some((a: string) => ingredientText.includes(a));
            });
        }

        return { success: true, recipes: parsedRecipes.slice(0, limit) };
    } catch (error) {
        console.error('Error getting top community recipes:', error);
        return { success: false, error: 'Erreur' };
    }
}

/**
 * Add a community recipe to user's meal plan
 */
export async function addRecipeToMealPlan(
    recipeId: string,
    date: string, // YYYY-MM-DD
    mealType: 'breakfast' | 'lunch' | 'snack' | 'dinner'
): Promise<{ success: boolean; error?: string }> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        // Get recipe
        const recipe = await prisma.recipe.findUnique({
            where: { id: recipeId },
        });

        if (!recipe) {
            return { success: false, error: 'Recette non trouvée' };
        }

        // Find or create meal plan for this week
        const targetDate = new Date(date);
        const startOfWeek = new Date(targetDate);
        startOfWeek.setDate(targetDate.getDate() - targetDate.getDay() + 1); // Monday
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday

        let mealPlan = await prisma.mealPlan.findFirst({
            where: {
                userId: session.user.id,
                startDate: { lte: targetDate },
                endDate: { gte: targetDate },
            },
            include: { days: true },
        });

        if (!mealPlan) {
            mealPlan = await prisma.mealPlan.create({
                data: {
                    userId: session.user.id,
                    startDate: startOfWeek,
                    endDate: endOfWeek,
                    status: 'active',
                },
                include: { days: true },
            });
        }

        // Find or create day
        let mealPlanDay = mealPlan.days.find(
            (d) => d.date.toISOString().split('T')[0] === date
        );

        if (!mealPlanDay) {
            mealPlanDay = await prisma.mealPlanDay.create({
                data: {
                    mealPlanId: mealPlan.id,
                    date: new Date(date),
                },
            });
        }

        // Add planned meal
        await prisma.plannedMeal.create({
            data: {
                mealPlanDayId: mealPlanDay.id,
                type: mealType,
                title: recipe.title,
                description: recipe.description,
                calories: recipe.calories,
                proteins: recipe.proteins,
                carbs: recipe.carbs,
                fats: recipe.fats,
                prepTime: recipe.prepTime,
            },
        });

        return { success: true };
    } catch (error) {
        console.error('Error adding recipe to meal plan:', error);
        return { success: false, error: 'Erreur lors de l\'ajout au plan' };
    }
}

/**
 * Get user's submitted recipes
 */
export async function getUserSubmittedRecipes(): Promise<{
    success: boolean;
    recipes?: any[];
    error?: string;
}> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        const recipes = await prisma.recipe.findMany({
            where: { authorId: session.user.id },
            orderBy: { createdAt: 'desc' },
        });

        const parsedRecipes = recipes.map((r) => ({
            ...r,
            ingredients: JSON.parse(r.ingredients),
            instructions: JSON.parse(r.instructions),
            tags: r.tags ? JSON.parse(r.tags) : [],
        }));

        return { success: true, recipes: parsedRecipes };
    } catch (error) {
        console.error('Error getting user recipes:', error);
        return { success: false, error: 'Erreur' };
    }
}

/**
 * Delete a recipe (only by author)
 */
export async function deleteRecipe(recipeId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { success: false, error: 'Non authentifié' };
    }

    try {
        // Find the recipe and verify ownership
        const recipe = await prisma.recipe.findUnique({
            where: { id: recipeId },
            select: { authorId: true },
        });

        if (!recipe) {
            return { success: false, error: 'Recette non trouvée' };
        }

        if (recipe.authorId !== session.user.id) {
            return { success: false, error: 'Vous ne pouvez supprimer que vos propres recettes' };
        }

        // Delete the recipe (ratings will cascade delete)
        await prisma.recipe.delete({
            where: { id: recipeId },
        });

        return { success: true };
    } catch (error) {
        console.error('Error deleting recipe:', error);
        return { success: false, error: 'Erreur lors de la suppression' };
    }
}
