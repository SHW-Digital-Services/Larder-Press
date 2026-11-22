import React, { useRef, useState } from 'react';
import { Link2, Upload, Loader2, AlertCircle, Film, ChefHat } from 'lucide-react';
import type { RecipeDraft, RecipeIngredient } from '../types/recipe';
import { RecipeSheet } from './RecipeSheet';

const HERO_IMAGE_PATH = '/src/assets/images/kitchen_prep_hero_1795362218065.jpg';

const SAMPLE_VIDEOS = [
  {
    label: 'Garlic Butter Pasta (YouTube)',
    url: 'https://www.youtube.com/watch?v=uV12h7G3V40',
    notes: 'Classic spaghetti aglio e olio style pasta with garlic, olive oil, butter, parsley, and chili flakes.',
  },
  {
    label: 'Chocolate Chip Cookies',
    url: 'https://www.youtube.com/watch?v=rEdl2Uetpvo',
    notes: '',
  },
  {
    label: 'Crispy Salmon Rice Bowl',
    url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
    notes: 'Pan-seared salmon with jasmine rice, cucumber, avocado, spicy mayo, and sesame oil.',
  },
];

interface VideoConverterProps {
  currentDraft: RecipeDraft | null;
  onDraftGenerated: (draft: RecipeDraft) => void;
  onSaveDraft: (draft: RecipeDraft) => Promise<void>;
  onAddToShoppingList: (
    ingredients: RecipeIngredient[],
    recipeTitle: string,
    recipeId: string
  ) => Promise<void>;
  isSaving: boolean;
  isAddingToShopping: boolean;
}

export const VideoConverter: React.FC<VideoConverterProps> = ({
  currentDraft,
  onDraftGenerated,
  onSaveDraft,
  onAddToShoppingList,
  isSaving,
  isAddingToShopping,
}) => {
  const [inputMode, setInputMode] = useState<'url' | 'upload'>('url');
  const [videoUrl, setVideoUrl] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [showNotesField, setShowNotesField] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(new Error('Could not read video file.'));
      reader.readAsDataURL(file);
    });

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (inputMode === 'url' && !videoUrl.trim()) {
      setError('Paste a cooking video link (YouTube, TikTok, Instagram, Vimeo, or recipe page).');
      return;
    }

    if (inputMode === 'upload') {
      if (!selectedFile) {
        setError('Choose a video file (MP4, MOV, or WebM) up to 20 MB.');
        return;
      }
      if (selectedFile.size > 20 * 1024 * 1024) {
        setError('Please upload a cooking clip under 20 MB, or paste an online video URL instead.');
        return;
      }
    }

    setIsExtracting(true);
    setProgressText(
      inputMode === 'upload'
        ? 'Analyzing cooking video frames and spoken narration...'
        : 'Reading video metadata, captions, and culinary context...'
    );

    try {
      let bodyPayload: Record<string, unknown>;
      if (inputMode === 'upload' && selectedFile) {
        const base64 = await fileToBase64(selectedFile);
        bodyPayload = {
          videoBase64: base64,
          videoMimeType: selectedFile.type || 'video/mp4',
          fileName: selectedFile.name,
          additionalNotes: additionalNotes.trim(),
        };
      } else {
        bodyPayload = {
          videoUrl: videoUrl.trim(),
          additionalNotes: additionalNotes.trim(),
        };
      }

      const timer = window.setTimeout(() => {
        setProgressText('Structuring ingredients, measurements, and step-by-step instructions...');
      }, 3000);

      const response = await fetch('/api/recipes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      window.clearTimeout(timer);

      const data = (await response.json()) as { recipe?: RecipeDraft; error?: string };
      if (!response.ok || !data.recipe) {
        throw new Error(
          data.error || 'Could not convert this video into a written recipe. Please check the URL or try adding video notes.'
        );
      }

      onDraftGenerated(data.recipe);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error converting video.');
    } finally {
      setIsExtracting(false);
      setProgressText('');
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-10 space-y-10">
      {/* Editorial Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-stone-500 mb-3">
              Video Transcription Desk
            </p>
            <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-stone-900 leading-[1.15] text-balance mb-3">
              Turn any cooking video into a clean, editable kitchen recipe.
            </h1>
            <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-xl mb-6">
              Paste a link from YouTube, TikTok, Instagram Reels, or upload a short clip. Edit
              quantities, swap ingredients, organize by tags, and build your shopping list.
            </p>

            {/* Input Mode Segmented Tabs */}
            <div className="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-lg mb-5">
              <button
                type="button"
                onClick={() => {
                  setInputMode('url');
                  setError(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  inputMode === 'url'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Paste Video URL</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputMode('upload');
                  setError(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  inputMode === 'upload'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Video Clip</span>
              </button>
            </div>

            <form onSubmit={handleExtract} className="space-y-4">
              {inputMode === 'url' ? (
                <div>
                  <label
                    htmlFor="video-url-input"
                    className="block text-xs font-medium text-stone-700 mb-1.5"
                  >
                    Online Cooking Video URL
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      id="video-url-input"
                      type="url"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="flex-1 px-4 py-2.5 text-sm text-stone-900 bg-[#FAF9F6] border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                    />
                    <button
                      type="submit"
                      disabled={isExtracting}
                      className="px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-2"
                    >
                      {isExtracting && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>{isExtracting ? 'Converting...' : 'Convert to Recipe'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-stone-300 bg-[#FAF9F6] rounded-lg p-5 text-center cursor-pointer hover:border-[#14532D] transition-colors"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <Film className="w-6 h-6 text-stone-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-stone-800">
                      {selectedFile ? selectedFile.name : 'Choose a cooking video clip'}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      MP4, MOV, or WebM up to 20 MB
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={isExtracting || !selectedFile}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    {isExtracting && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{isExtracting ? 'Analyzing Clip...' : 'Convert Video Clip'}</span>
                  </button>
                </div>
              )}

              {/* Optional Caption / Notes Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowNotesField((v) => !v)}
                  className="text-xs font-medium text-stone-500 hover:text-stone-900 underline-offset-4 hover:underline"
                >
                  {showNotesField
                    ? 'Hide extra caption / ingredient notes'
                    : '+ Paste extra video caption or notes (helpful for short social clips)'}
                </button>
                {showNotesField && (
                  <textarea
                    rows={3}
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    placeholder="Paste any ingredients or instructions from the video caption if the link is behind a social login..."
                    className="mt-2 w-full px-3.5 py-2 text-xs text-stone-800 bg-[#FAF9F6] border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                  />
                )}
              </div>

              {isExtracting && progressText && (
                <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg flex items-center gap-2.5 text-xs text-stone-700">
                  <Loader2 className="w-4 h-4 animate-spin text-[#14532D] shrink-0" />
                  <span>{progressText}</span>
                </div>
              )}

              {error && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </form>
          </div>

          {inputMode === 'url' && (
            <div className="pt-5 mt-6 border-t border-stone-200 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
              <span>Examples:</span>
              {SAMPLE_VIDEOS.map((sample, idx) => (
                <React.Fragment key={sample.url}>
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <button
                    type="button"
                    onClick={() => {
                      setVideoUrl(sample.url);
                      if (sample.notes) {
                        setAdditionalNotes(sample.notes);
                        setShowNotesField(true);
                      } else {
                        setAdditionalNotes('');
                      }
                    }}
                    className="text-stone-700 hover:text-[#14532D] underline-offset-4 hover:underline"
                  >
                    {sample.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Editorial Hero Visual */}
        <div className="lg:col-span-5">
          <div className="h-full min-h-[260px] rounded-xl overflow-hidden border border-stone-200 bg-stone-100 relative">
            {!heroImgFailed ? (
              <img
                src={HERO_IMAGE_PATH}
                alt="Fresh kitchen ingredients beside an open linen recipe journal"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-stone-100 to-stone-200">
                <ChefHat className="w-10 h-10 text-stone-400 mb-3" />
                <p className="font-editorial text-lg text-stone-700">Larder Press Kitchen</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Converted Written Recipe Sheet */}
      {currentDraft && (
        <section aria-label="Converted written recipe">
          <RecipeSheet
            recipe={currentDraft}
            isSaved={false}
            isSaving={isSaving}
            isAddingToShopping={isAddingToShopping}
            onSaveRecipe={onSaveDraft}
            onAddToShoppingList={onAddToShoppingList}
          />
        </section>
      )}
    </div>
  );
};
