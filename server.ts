import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function detectPlatform(urlStr: string): string {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('vimeo.com')) return 'Vimeo';
    if (host.includes('facebook.com') || host.includes('fb.watch')) return 'Facebook';
    return host.replace(/^www\./, '');
  } catch {
    return 'Online Video';
  }
}

function extractYouTubeId(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }
    if (parsed.pathname.includes('/shorts/')) {
      return parsed.pathname.split('/shorts/')[1]?.split('/')[0] || null;
    }
    if (parsed.pathname.includes('/embed/')) {
      return parsed.pathname.split('/embed/')[1]?.split('/')[0] || null;
    }
    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\\n/g, '\n');
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

interface VideoContextBundle {
  platform: string;
  title: string;
  creatorName: string;
  thumbnailUrl: string;
  description: string;
  transcript: string;
  jsonLdSummary: string;
}

async function gatherVideoMetadata(videoUrl: string): Promise<VideoContextBundle> {
  const platform = detectPlatform(videoUrl);
  const result: VideoContextBundle = {
    platform,
    title: '',
    creatorName: '',
    thumbnailUrl: '',
    description: '',
    transcript: '',
    jsonLdSummary: '',
  };

  const ytId = extractYouTubeId(videoUrl);
  if (ytId) {
    result.thumbnailUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
  }

  // 1. Try public oEmbed endpoints first
  try {
    let oembedEndpoint = '';
    if (platform === 'YouTube') {
      oembedEndpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    } else if (platform === 'TikTok') {
      oembedEndpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    } else if (platform === 'Vimeo') {
      oembedEndpoint = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`;
    }

    if (oembedEndpoint) {
      const oembedRes = await fetchWithTimeout(oembedEndpoint, 6000);
      if (oembedRes.ok) {
        const data = (await oembedRes.json()) as Record<string, unknown>;
        if (typeof data.title === 'string') result.title = data.title;
        if (typeof data.author_name === 'string') result.creatorName = data.author_name;
        if (typeof data.thumbnail_url === 'string') result.thumbnailUrl = data.thumbnail_url;
      }
    }
  } catch {
    // Non-fatal: continue to HTML/Gemini extraction
  }

  // 2. Fetch page HTML for meta tags, JSON-LD, and YouTube caption tracks / description
  try {
    const pageRes = await fetchWithTimeout(videoUrl, 8000);
    if (pageRes.ok) {
      const html = await pageRes.text();

      const ogTitle =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
      if (!result.title && ogTitle) {
        result.title = decodeHtmlEntities(ogTitle).trim();
      }

      const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
      if (!result.thumbnailUrl && ogImage) {
        result.thumbnailUrl = decodeHtmlEntities(ogImage).trim();
      }

      const ogDesc =
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
      if (ogDesc) {
        result.description = decodeHtmlEntities(ogDesc).trim();
      }

      // Extract JSON-LD blocks (useful for recipe blogs / video pages)
      const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      if (ldMatches.length > 0) {
        const joined = ldMatches
          .map((m) => m[1].trim())
          .join('\n')
          .slice(0, 6000);
        result.jsonLdSummary = joined;
      }

      // Extract YouTube full description and caption track if present
      if (platform === 'YouTube') {
        const shortDescMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
        if (shortDescMatch?.[1]) {
          try {
            result.description = JSON.parse(`"${shortDescMatch[1]}"`) as string;
          } catch {
            result.description = decodeHtmlEntities(shortDescMatch[1]);
          }
        }

        const captionMatch = html.match(/"captionTracks":\s*(\[[\s\S]*?\])/);
        if (captionMatch?.[1]) {
          try {
            const tracks = JSON.parse(captionMatch[1]) as Array<{ baseUrl?: string; languageCode?: string }>;
            const preferred =
              tracks.find((t) => t.languageCode?.startsWith('en')) || tracks[0];
            if (preferred?.baseUrl) {
              const capRes = await fetchWithTimeout(preferred.baseUrl, 6000);
              if (capRes.ok) {
                const xml = await capRes.text();
                const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
                  .map((m) => decodeHtmlEntities(m[1]).replace(/<[^>]+>/g, '').trim())
                  .filter(Boolean);
                result.transcript = lines.join(' ').slice(0, 12000);
              }
            }
          } catch {
            // Non-fatal: continue with URL context + description
          }
        }
      }
    }
  } catch {
    // Non-fatal: Gemini URL context + search grounding can still inspect public URLs
  }

  return result;
}

const recipeResponseSchema = {
  type: Type.OBJECT,
  properties: {
    isCookingVideo: {
      type: Type.BOOLEAN,
      description: 'True if the source describes or demonstrates a real food/drink recipe.',
    },
    rejectionReason: {
      type: Type.STRING,
      description: 'If isCookingVideo is false, a concise explanation of why.',
    },
    title: { type: Type.STRING, description: 'Clear recipe title (max 120 chars).' },
    summary: { type: Type.STRING, description: 'Concise 1-2 sentence editorial summary of the dish.' },
    creatorName: { type: Type.STRING, description: 'Video creator or channel name if known, else empty string.' },
    prepTimeMinutes: { type: Type.INTEGER, description: 'Estimated prep time in minutes (integer >= 0).' },
    cookTimeMinutes: { type: Type.INTEGER, description: 'Estimated active/passive cook time in minutes (integer >= 0).' },
    servings: { type: Type.INTEGER, description: 'Number of servings (integer >= 1).' },
    difficulty: {
      type: Type.STRING,
      description: 'Must be exactly one of: Easy, Medium, Challenging.',
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Up to 6 concise category tags such as Italian, Dessert, Quick & Easy, Vegetarian, Weeknight.',
    },
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          quantity: { type: Type.STRING, description: 'Numeric or fractional amount, e.g. "2" or "1.5" or "1/2". Empty string if to taste.' },
          unit: { type: Type.STRING, description: 'Measurement unit, e.g. "cups", "tbsp", "g", "cloves". Empty string if count item.' },
          item: { type: Type.STRING, description: 'Ingredient name, e.g. "unsalted butter" or "yellow onion".' },
          notes: { type: Type.STRING, description: 'Prep note like "finely diced" or "room temperature", or empty string.' },
        },
        required: ['quantity', 'unit', 'item', 'notes'],
      },
      description: 'Complete list of ingredients used in the video.',
    },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stepNumber: { type: Type.INTEGER },
          title: { type: Type.STRING, description: 'Short 2-5 word step heading.' },
          instruction: { type: Type.STRING, description: 'Detailed, actionable step instruction.' },
          durationMinutes: { type: Type.INTEGER, description: 'Approximate step duration in minutes, or 0 if instantaneous.' },
          tip: { type: Type.STRING, description: 'Helpful technique cue from the video, or empty string.' },
        },
        required: ['stepNumber', 'title', 'instruction', 'durationMinutes', 'tip'],
      },
    },
    notes: {
      type: Type.STRING,
      description: 'Any storage, plating, or substitution notes mentioned in the video.',
    },
  },
  required: [
    'isCookingVideo',
    'rejectionReason',
    'title',
    'summary',
    'creatorName',
    'prepTimeMinutes',
    'cookTimeMinutes',
    'servings',
    'difficulty',
    'tags',
    'ingredients',
    'steps',
    'notes',
  ],
};

function sanitizeRecipeOutput(
  raw: Record<string, unknown>,
  meta: { sourceUrl: string; videoPlatform: string; creatorName: string; thumbnailUrl: string }
) {
  const difficultyRaw = String(raw.difficulty || 'Medium');
  const difficulty: 'Easy' | 'Medium' | 'Challenging' =
    difficultyRaw === 'Easy' || difficultyRaw === 'Challenging' ? difficultyRaw : 'Medium';

  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  const tags = rawTags
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 12);

  const rawIngredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  const ingredients = rawIngredients
    .slice(0, 60)
    .map((ing, idx) => {
      const obj = (ing && typeof ing === 'object' ? ing : {}) as Record<string, unknown>;
      return {
        id: `ing-${Date.now()}-${idx}`,
        quantity: String(obj.quantity ?? '').trim().slice(0, 40),
        unit: String(obj.unit ?? '').trim().slice(0, 40),
        item: String(obj.item ?? '').trim().slice(0, 200),
        notes: String(obj.notes ?? '').trim().slice(0, 200),
      };
    })
    .filter((ing) => ing.item.length > 0);

  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  const steps = rawSteps
    .slice(0, 40)
    .map((st, idx) => {
      const obj = (st && typeof st === 'object' ? st : {}) as Record<string, unknown>;
      const dur = Number(obj.durationMinutes);
      return {
        stepNumber: idx + 1,
        title: String(obj.title ?? `Step ${idx + 1}`).trim().slice(0, 120) || `Step ${idx + 1}`,
        instruction: String(obj.instruction ?? '').trim().slice(0, 2000),
        durationMinutes: Number.isFinite(dur) && dur >= 0 ? Math.min(1440, Math.round(dur)) : 0,
        tip: String(obj.tip ?? '').trim().slice(0, 400),
      };
    })
    .filter((st) => st.instruction.length > 0);

  const prep = Number(raw.prepTimeMinutes);
  const cook = Number(raw.cookTimeMinutes);
  const serv = Number(raw.servings);

  return {
    title: String(raw.title ?? 'Untitled Video Recipe').trim().slice(0, 160) || 'Untitled Video Recipe',
    summary: String(raw.summary ?? '').trim().slice(0, 800),
    sourceUrl: meta.sourceUrl.slice(0, 1000),
    videoPlatform: meta.videoPlatform.slice(0, 60),
    creatorName: (String(raw.creatorName ?? '').trim() || meta.creatorName).slice(0, 120),
    thumbnailUrl: meta.thumbnailUrl.slice(0, 1000),
    prepTimeMinutes: Number.isFinite(prep) && prep >= 0 ? Math.min(1440, Math.round(prep)) : 15,
    cookTimeMinutes: Number.isFinite(cook) && cook >= 0 ? Math.min(2880, Math.round(cook)) : 20,
    servings: Number.isFinite(serv) && serv >= 1 ? Math.min(100, Math.round(serv)) : 4,
    difficulty,
    tags: tags.length > 0 ? tags : ['Video Recipe'],
    ingredients,
    steps,
    notes: String(raw.notes ?? '').trim().slice(0, 2000),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '32mb' }));

  app.post('/api/recipes/extract', async (req: Request, res: Response) => {
    try {
      const { videoUrl, additionalNotes, videoBase64, videoMimeType, fileName } = req.body as {
        videoUrl?: string;
        additionalNotes?: string;
        videoBase64?: string;
        videoMimeType?: string;
        fileName?: string;
      };

      const ai = getGeminiClient();

      // Path A: Direct uploaded video file
      if (videoBase64 && videoMimeType) {
        const promptText = [
          'Watch and listen carefully to this cooking video and turn it into a complete, practical, accurate written recipe.',
          additionalNotes ? `User notes: ${additionalNotes}` : '',
          'Separate quantities, units, ingredient names, and preparation notes cleanly so each ingredient can be edited or added to a shopping list.',
          'If this video does not show cooking or a recipe, set isCookingVideo to false and explain why.',
        ]
          .filter(Boolean)
          .join('\n\n');

        const structuredRes = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: videoMimeType,
                  data: videoBase64,
                },
              },
              { text: promptText },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: recipeResponseSchema,
          },
        });

        const parsed = JSON.parse((structuredRes.text ?? '{}').trim()) as Record<string, unknown>;
        if (parsed.isCookingVideo === false) {
          return res.status(422).json({
            error: String(parsed.rejectionReason || 'The uploaded video does not appear to contain a cooking recipe.'),
          });
        }

        const sanitized = sanitizeRecipeOutput(parsed, {
          sourceUrl: fileName ? `uploaded://${fileName}` : 'uploaded://video-clip',
          videoPlatform: 'Uploaded Video',
          creatorName: '',
          thumbnailUrl: '',
        });

        if (sanitized.ingredients.length === 0 || sanitized.steps.length === 0) {
          return res.status(422).json({
            error: 'Could not extract enough ingredients or cooking steps from the video clip.',
          });
        }

        return res.json({ recipe: sanitized });
      }

      // Path B: Online video URL (YouTube, TikTok, Instagram, Vimeo, Web)
      const trimmedUrl = (videoUrl || '').trim();
      if (!trimmedUrl) {
        return res.status(400).json({ error: 'Please provide an online cooking video URL or upload a video clip.' });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(trimmedUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return res.status(400).json({ error: 'Please enter a valid http:// or https:// video URL.' });
        }
      } catch {
        return res.status(400).json({ error: 'Please enter a valid URL (for example, https://www.youtube.com/watch?v=...).' });
      }

      const context = await gatherVideoMetadata(parsedUrl.toString());

      // Step 1: Grounded culinary research using URL Context + Google Search + extracted transcript/description
      const gatheredContextText = [
        `Target Video URL: ${parsedUrl.toString()}`,
        `Platform: ${context.platform}`,
        context.title ? `Detected Title: ${context.title}` : '',
        context.creatorName ? `Creator/Channel: ${context.creatorName}` : '',
        context.description ? `Video Description:\n${context.description.slice(0, 4000)}` : '',
        context.transcript ? `Video Transcript:\n${context.transcript.slice(0, 8000)}` : '',
        context.jsonLdSummary ? `Structured Page Metadata:\n${context.jsonLdSummary.slice(0, 4000)}` : '',
        additionalNotes ? `User-Provided Context/Notes:\n${additionalNotes}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const researchResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          'You are a culinary transcription editor. Inspect the online cooking video URL below and combine it with the extracted metadata/transcript and web/URL context to produce a thorough written draft of the recipe.',
          'Include exact dish name, creator, prep/cook times, servings, difficulty, suggested category tags (like Italian, Dessert, Quick & Easy, Weeknight, etc.), every ingredient with exact quantities and units, and detailed chronological cooking steps with technique tips.',
          'If you cannot determine any real recipe details for this URL (for instance, a private/deleted video or non-cooking link), clearly state that the video recipe could not be verified.',
          '',
          gatheredContextText,
        ].join('\n'),
        config: {
          tools: [{ urlContext: {} }, { googleSearch: {} }],
        },
      });

      const researchNotes = (researchResponse.text ?? '').trim();
      if (!researchNotes) {
        return res.status(422).json({
          error: 'Could not read recipe information from that video URL. Try pasting extra description notes or uploading the clip.',
        });
      }

      // Step 2: Normalize into strict JSON schema
      const structuredRes = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          'Convert the following researched cooking video notes into the exact JSON recipe schema.',
          'Be faithful to the dish and measurements. Separate each ingredient cleanly into numeric/fractional quantity, unit, item name, and prep notes.',
          'Assign 2 to 5 accurate category tags (e.g., Italian, Dessert, Quick & Easy, Vegetarian, Weeknight, Baking, Asian, Breakfast).',
          'If the notes indicate that no real cooking video or recipe could be verified from the URL, set isCookingVideo to false and provide a helpful rejectionReason.',
          '',
          `Metadata Title: ${context.title || 'Unknown'}`,
          `Creator: ${context.creatorName || 'Unknown'}`,
          '',
          researchNotes,
        ].join('\n'),
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: recipeResponseSchema,
        },
      });

      const parsed = JSON.parse((structuredRes.text ?? '{}').trim()) as Record<string, unknown>;
      if (parsed.isCookingVideo === false) {
        return res.status(422).json({
          error: String(
            parsed.rejectionReason ||
              'We could not verify a cooking recipe at this URL. Some social links block automated access—try pasting key captions or notes below.'
          ),
        });
      }

      const sanitized = sanitizeRecipeOutput(parsed, {
        sourceUrl: parsedUrl.toString(),
        videoPlatform: context.platform,
        creatorName: context.creatorName,
        thumbnailUrl: context.thumbnailUrl,
      });

      if (sanitized.ingredients.length === 0 || sanitized.steps.length === 0) {
        return res.status(422).json({
          error: 'Could not extract complete ingredients and steps from that video. Try adding video notes or trying another link.',
        });
      }

      return res.json({ recipe: sanitized });
    } catch (error) {
      console.error('Recipe extraction error:', error);
      const message =
        error instanceof Error ? error.message : 'Unexpected server error while converting video.';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/recipes/suggest-substitute', async (req: Request, res: Response) => {
    try {
      const { item, quantity, unit, recipeTitle, preference } = req.body as {
        item?: string;
        quantity?: string;
        unit?: string;
        recipeTitle?: string;
        preference?: string;
      };

      if (!item?.trim()) {
        return res.status(400).json({ error: 'Ingredient item is required.' });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          `Suggest 3 practical culinary substitutes for "${quantity || ''} ${unit || ''} ${item}".`,
          recipeTitle ? `Dish context: ${recipeTitle}.` : '',
          preference ? `Dietary/cooking preference: ${preference}.` : '',
          'Return accurate converted quantities and units (e.g. replacing 2 cups butter with 1.5 cups olive oil where ratio differs).',
        ]
          .filter(Boolean)
          .join('\n'),
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    substituteItem: { type: Type.STRING },
                    quantity: { type: Type.STRING },
                    unit: { type: Type.STRING },
                    notes: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                  },
                  required: ['substituteItem', 'quantity', 'unit', 'notes', 'rationale'],
                },
              },
            },
            required: ['suggestions'],
          },
        },
      });

      const data = JSON.parse((response.text ?? '{"suggestions":[]}').trim()) as {
        suggestions?: unknown[];
      };
      return res.json({ suggestions: Array.isArray(data.suggestions) ? data.suggestions : [] });
    } catch (error) {
      console.error('Substitute suggestion error:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to generate substitute suggestions.';
      return res.status(500).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Larder Press server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
