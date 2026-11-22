import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Check,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  ShoppingBasket,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  RecipeDraft,
  RecipeIngredient,
  SavedRecipe,
  SubstituteSuggestion,
} from '../types/recipe';
import { scaleQuantityString } from '../lib/ingredientParser';

const PRESET_TAGS = [
  'Italian',
  'Dessert',
  'Quick & Easy',
  'Weeknight',
  'Vegetarian',
  'Baking',
  'Breakfast',
  'Healthy',
  'Comfort Food',
];

interface RecipeSheetProps {
  recipe: RecipeDraft | SavedRecipe;
  isSaved: boolean;
  isSaving: boolean;
  isAddingToShopping: boolean;
  onSaveRecipe: (updated: RecipeDraft) => Promise<void>;
  onUpdateTags?: (tags: string[]) => Promise<void>;
  onDeleteRecipe?: () => Promise<void>;
  onAddToShoppingList: (ingredients: RecipeIngredient[], recipeTitle: string, recipeId: string) => Promise<void>;
  onBack?: () => void;
}

function isSavedRecipe(r: RecipeDraft | SavedRecipe): r is SavedRecipe {
  return 'id' in r && typeof r.id === 'string';
}

export const RecipeSheet: React.FC<RecipeSheetProps> = ({
  recipe,
  isSaved,
  isSaving,
  isAddingToShopping,
  onSaveRecipe,
  onUpdateTags,
  onDeleteRecipe,
  onAddToShoppingList,
  onBack,
}) => {
  const [draft, setDraft] = useState<RecipeDraft>(() => ({
    title: recipe.title,
    summary: recipe.summary,
    sourceUrl: recipe.sourceUrl,
    videoPlatform: recipe.videoPlatform,
    creatorName: recipe.creatorName,
    thumbnailUrl: recipe.thumbnailUrl,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    tags: [...recipe.tags],
    ingredients: recipe.ingredients.map((i) => ({ ...i })),
    steps: recipe.steps.map((s) => ({ ...s })),
    notes: recipe.notes,
  }));

  const [isEditingIngredients, setIsEditingIngredients] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [scaleMultiplier, setScaleMultiplier] = useState(1);
  const [selectedForShopping, setSelectedForShopping] = useState<Record<string, boolean>>({});
  const [showShoppingSelector, setShowShoppingSelector] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [saveSuccessFlash, setSaveSuccessFlash] = useState(false);
  const [shoppingSuccessText, setShoppingSuccessText] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Substitute drawer state for a specific ingredient
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const [swapSuggestions, setSwapSuggestions] = useState<SubstituteSuggestion[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      title: recipe.title,
      summary: recipe.summary,
      sourceUrl: recipe.sourceUrl,
      videoPlatform: recipe.videoPlatform,
      creatorName: recipe.creatorName,
      thumbnailUrl: recipe.thumbnailUrl,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      servings: recipe.servings,
      difficulty: recipe.difficulty,
      tags: [...recipe.tags],
      ingredients: recipe.ingredients.map((i) => ({ ...i })),
      steps: recipe.steps.map((s) => ({ ...s })),
      notes: recipe.notes,
    });
    setHasUnsavedChanges(false);
    setScaleMultiplier(1);
    setSwapTargetId(null);
    setConfirmDelete(false);
    const initialMap: Record<string, boolean> = {};
    for (const ing of recipe.ingredients) {
      initialMap[ing.id] = true;
    }
    setSelectedForShopping(initialMap);
  }, [recipe]);

  const updateIngredientField = (
    id: string,
    field: keyof RecipeIngredient,
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((ing) => {
        if (ing.id !== id) return ing;
        if (field === 'item' && !ing.substitutedFrom && ing.item.trim() && value.trim() !== ing.item.trim()) {
          return { ...ing, item: value, substitutedFrom: ing.item };
        }
        return { ...ing, [field]: value };
      }),
    }));
    setHasUnsavedChanges(true);
  };

  const handleAddIngredientRow = () => {
    const newId = `ing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setDraft((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        { id: newId, quantity: '1', unit: '', item: '', notes: '' },
      ],
    }));
    setSelectedForShopping((prev) => ({ ...prev, [newId]: true }));
    setIsEditingIngredients(true);
    setHasUnsavedChanges(true);
  };

  const handleRemoveIngredientRow = (id: string) => {
    if (draft.ingredients.length <= 1) return;
    setDraft((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((ing) => ing.id !== id),
    }));
    setHasUnsavedChanges(true);
  };

  const handleFetchSubstitutes = async (ing: RecipeIngredient) => {
    if (swapTargetId === ing.id) {
      setSwapTargetId(null);
      return;
    }
    setSwapTargetId(ing.id);
    setSwapLoading(true);
    setSwapError(null);
    setSwapSuggestions([]);
    try {
      const res = await fetch('/api/recipes/suggest-substitute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: ing.item,
          quantity: ing.quantity,
          unit: ing.unit,
          recipeTitle: draft.title,
        }),
      });
      const data = (await res.json()) as { suggestions?: SubstituteSuggestion[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Could not load substitute options.');
      }
      setSwapSuggestions(data.suggestions || []);
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : 'Failed to suggest substitutes.');
    } finally {
      setSwapLoading(false);
    }
  };

  const applySubstitute = (ingId: string, sub: SubstituteSuggestion) => {
    setDraft((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((ing) => {
        if (ing.id !== ingId) return ing;
        const originalName = ing.substitutedFrom || ing.item;
        return {
          ...ing,
          quantity: sub.quantity,
          unit: sub.unit,
          item: sub.substituteItem,
          notes: sub.notes || ing.notes,
          substitutedFrom: originalName,
        };
      }),
    }));
    setSwapTargetId(null);
    setHasUnsavedChanges(true);
  };

  const handleScaleChange = (factor: number) => {
    setScaleMultiplier(factor);
  };

  const applyScaledQuantitiesToDraft = () => {
    if (scaleMultiplier === 1) return;
    setDraft((prev) => ({
      ...prev,
      servings: Math.max(1, Math.round(prev.servings * scaleMultiplier)),
      ingredients: prev.ingredients.map((ing) => ({
        ...ing,
        quantity: scaleQuantityString(ing.quantity, scaleMultiplier),
      })),
    }));
    setScaleMultiplier(1);
    setHasUnsavedChanges(true);
  };

  const handleAddTag = async (tagValue: string) => {
    const clean = tagValue.trim().slice(0, 40);
    if (!clean) return;
    if (draft.tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setNewTagInput('');
      return;
    }
    if (draft.tags.length >= 12) return;
    const nextTags = [...draft.tags, clean];
    setDraft((prev) => ({ ...prev, tags: nextTags }));
    setNewTagInput('');
    if (isSaved && onUpdateTags) {
      await onUpdateTags(nextTags);
    } else {
      setHasUnsavedChanges(true);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const nextTags = draft.tags.filter((t) => t !== tagToRemove);
    setDraft((prev) => ({ ...prev, tags: nextTags }));
    if (isSaved && onUpdateTags) {
      await onUpdateTags(nextTags);
    } else {
      setHasUnsavedChanges(true);
    }
  };

  const handleSave = async () => {
    const cleanedIngredients = draft.ingredients.filter((i) => i.item.trim().length > 0);
    const payload: RecipeDraft = {
      ...draft,
      servings: Math.max(1, Math.round(draft.servings * scaleMultiplier)),
      ingredients:
        scaleMultiplier !== 1
          ? cleanedIngredients.map((i) => ({
              ...i,
              quantity: scaleQuantityString(i.quantity, scaleMultiplier),
            }))
          : cleanedIngredients,
    };
    await onSaveRecipe(payload);
    setScaleMultiplier(1);
    setHasUnsavedChanges(false);
    setIsEditingIngredients(false);
    setSaveSuccessFlash(true);
    setTimeout(() => setSaveSuccessFlash(false), 2200);
  };

  const handleAddShopping = async () => {
    const scaledList = draft.ingredients
      .filter((ing) => ing.item.trim().length > 0)
      .filter((ing) => (showShoppingSelector ? selectedForShopping[ing.id] !== false : true))
      .map((ing) => ({
        ...ing,
        quantity: scaleQuantityString(ing.quantity, scaleMultiplier),
      }));

    if (scaledList.length === 0) return;

    const recipeId = isSavedRecipe(recipe) ? recipe.id : 'draft';
    await onAddToShoppingList(scaledList, draft.title, recipeId);
    setShoppingSuccessText(`Added ${scaledList.length} ingredient${scaledList.length === 1 ? '' : 's'} to Shopping List`);
    setShowShoppingSelector(false);
    setTimeout(() => setShoppingSuccessText(null), 3200);
  };

  const handleCopyMarkdown = async () => {
    const lines = [
      `# ${draft.title}`,
      '',
      draft.summary,
      '',
      `Prep: ${draft.prepTimeMinutes} min | Cook: ${draft.cookTimeMinutes} min | Servings: ${Math.round(draft.servings * scaleMultiplier)} | Difficulty: ${draft.difficulty}`,
      draft.tags.length > 0 ? `Tags: ${draft.tags.join(', ')}` : '',
      '',
      '## Ingredients',
      ...draft.ingredients.map((ing) => {
        const qty = scaleQuantityString(ing.quantity, scaleMultiplier);
        const main = [qty, ing.unit, ing.item].filter(Boolean).join(' ');
        return `- ${main}${ing.notes ? `, ${ing.notes}` : ''}`;
      }),
      '',
      '## Instructions',
      ...draft.steps.map(
        (st) => `${st.stepNumber}. **${st.title}**: ${st.instruction}${st.tip ? ` _(Tip: ${st.tip})_` : ''}`
      ),
    ].filter((l) => l !== undefined);

    await navigator.clipboard.writeText(lines.join('\n'));
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2000);
  };

  const totalMinutes = draft.prepTimeMinutes + draft.cookTimeMinutes;
  const displayedServings = Math.max(1, Math.round(draft.servings * scaleMultiplier));

  return (
    <article className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Top Action Strip */}
      <div className="px-6 py-4 border-b border-stone-200 bg-stone-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-xs font-medium text-stone-600 hover:text-stone-900 underline-offset-4 hover:underline whitespace-nowrap shrink-0"
            >
              &larr; Back to Cookbook
            </button>
          )}
          <span className="text-xs text-stone-500 whitespace-nowrap">
            {isSaved ? 'Saved in Cookbook' : 'Converted Recipe Draft'}
            {hasUnsavedChanges && ' · Unsaved edits'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAddShopping}
            disabled={isAddingToShopping}
            className="px-3.5 py-2 text-xs font-medium text-stone-900 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {isAddingToShopping ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShoppingBasket className="w-3.5 h-3.5 text-[#14532D]" />
            )}
            <span>Add to Shopping List</span>
          </button>

          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-[#14532D]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedMarkdown ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors hidden sm:flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saveSuccessFlash ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Bookmark className="w-3.5 h-3.5" />
            )}
            <span>
              {saveSuccessFlash
                ? 'Saved'
                : isSaved
                ? hasUnsavedChanges
                  ? 'Save Changes'
                  : 'Saved'
                : 'Save Recipe'}
            </span>
          </button>
        </div>
      </div>

      {shoppingSuccessText && (
        <div className="px-6 py-2.5 bg-[#14532D]/5 border-b border-[#14532D]/15 text-xs font-medium text-[#14532D] flex items-center gap-2">
          <Check className="w-3.5 h-3.5" />
          <span>{shoppingSuccessText}</span>
        </div>
      )}

      {/* Editorial Recipe Header */}
      <div className="p-6 sm:p-8 border-b border-stone-200">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
              <span>{draft.videoPlatform}</span>
              {draft.creatorName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>By {draft.creatorName}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{draft.difficulty}</span>
              {draft.sourceUrl && draft.sourceUrl.startsWith('http') && (
                <>
                  <span aria-hidden="true">·</span>
                  <a
                    href={draft.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#14532D] hover:underline"
                  >
                    <span>Source Video</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              )}
            </div>

            <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-stone-900 leading-tight text-balance">
              {draft.title}
            </h2>

            {draft.summary && (
              <p className="text-base text-stone-600 leading-relaxed max-w-2xl">
                {draft.summary}
              </p>
            )}

            {/* Quantitative Metadata Strip */}
            <div className="pt-2 flex flex-wrap items-center gap-6 text-xs text-stone-700">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-stone-400" />
                <span className="font-mono tabular-nums">
                  Prep {draft.prepTimeMinutes}m · Cook {draft.cookTimeMinutes}m · Total {totalMinutes}m
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-stone-400" />
                <span className="font-mono tabular-nums">{displayedServings} servings</span>
              </div>
            </div>

            {/* Recipe Categorization Tags */}
            <div className="pt-3 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-stone-500 mr-1">Categories:</span>
                {draft.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-stone-800 bg-stone-100 border border-stone-200 rounded-md"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={`Remove ${tag} tag`}
                      className="text-stone-400 hover:text-stone-900 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleAddTag(newTagInput);
                  }}
                  className="inline-flex items-center gap-1"
                >
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="Add tag..."
                    aria-label="Add category tag"
                    className="w-28 px-2.5 py-1 text-xs border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                  />
                  <button
                    type="submit"
                    disabled={!newTagInput.trim()}
                    className="px-2 py-1 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-md hover:bg-stone-50 disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>
              </div>

              {/* Quick one-click preset tags */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                <span>Quick add:</span>
                {PRESET_TAGS.filter(
                  (pt) => !draft.tags.some((t) => t.toLowerCase() === pt.toLowerCase())
                )
                  .slice(0, 6)
                  .map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => void handleAddTag(preset)}
                      className="px-2 py-0.5 text-[11px] text-stone-600 hover:text-[#14532D] hover:bg-[#14532D]/5 rounded transition-colors"
                    >
                      + {preset}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {draft.thumbnailUrl && (
            <div className="w-full lg:w-64 shrink-0">
              <div className="aspect-[4/3] rounded-lg overflow-hidden border border-stone-200 bg-stone-100">
                <img
                  src={draft.thumbnailUrl}
                  alt={draft.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main 2-Column Editorial Recipe Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-stone-200">
        {/* Left Column: Editable Ingredients + Scaling + Shopping Selection */}
        <div className="lg:col-span-5 p-6 sm:p-8 space-y-5 bg-[#FAF9F6]/50">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-editorial text-xl font-semibold text-stone-900">
              Ingredients
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowShoppingSelector((v) => !v)}
                className="px-2.5 py-1 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-md hover:bg-stone-50 transition-colors"
              >
                {showShoppingSelector ? 'Done Selecting' : 'Select for Cart'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditingIngredients((v) => !v)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors flex items-center gap-1 ${
                  isEditingIngredients
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                }`}
              >
                <Edit3 className="w-3 h-3" />
                <span>{isEditingIngredients ? 'Finish Editing' : 'Edit List'}</span>
              </button>
            </div>
          </div>

          {/* Serving Scale Segmented Control */}
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-y border-stone-200">
            <span className="text-xs font-medium text-stone-600">Scale batch:</span>
            <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-md">
              {[0.5, 1, 1.5, 2].map((factor) => (
                <button
                  key={factor}
                  type="button"
                  onClick={() => handleScaleChange(factor)}
                  className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded transition-colors ${
                    scaleMultiplier === factor
                      ? 'bg-white text-stone-900 font-semibold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {factor}×
                </button>
              ))}
            </div>
            {scaleMultiplier !== 1 && (
              <button
                type="button"
                onClick={applyScaledQuantitiesToDraft}
                className="text-[11px] font-medium text-[#14532D] hover:underline"
              >
                Lock {scaleMultiplier}× into recipe
              </button>
            )}
          </div>

          {/* Ingredient Rows */}
          <ul className="space-y-2.5">
            {draft.ingredients.map((ing) => {
              const displayQty =
                scaleMultiplier === 1
                  ? ing.quantity
                  : scaleQuantityString(ing.quantity, scaleMultiplier);

              return (
                <li
                  key={ing.id}
                  className="bg-white border border-stone-200 rounded-lg p-3 space-y-2"
                >
                  {isEditingIngredients ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-12 gap-2">
                        <input
                          type="text"
                          value={ing.quantity}
                          onChange={(e) => updateIngredientField(ing.id, 'quantity', e.target.value)}
                          placeholder="Qty"
                          aria-label="Quantity"
                          className="col-span-3 px-2.5 py-1.5 text-xs font-mono tabular-nums border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                        />
                        <input
                          type="text"
                          value={ing.unit}
                          onChange={(e) => updateIngredientField(ing.id, 'unit', e.target.value)}
                          placeholder="Unit"
                          aria-label="Unit"
                          className="col-span-3 px-2.5 py-1.5 text-xs border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                        />
                        <input
                          type="text"
                          value={ing.item}
                          onChange={(e) => updateIngredientField(ing.id, 'item', e.target.value)}
                          placeholder="Ingredient name"
                          aria-label="Ingredient name"
                          className="col-span-6 px-2.5 py-1.5 text-xs font-medium border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={ing.notes}
                          onChange={(e) => updateIngredientField(ing.id, 'notes', e.target.value)}
                          placeholder="Prep notes (e.g., melted, finely diced)"
                          aria-label="Preparation notes"
                          className="flex-1 px-2.5 py-1 text-xs text-stone-600 border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                        />
                        <button
                          type="button"
                          onClick={() => void handleFetchSubstitutes(ing)}
                          className="px-2.5 py-1 text-[11px] font-medium text-[#14532D] bg-[#14532D]/5 border border-[#14532D]/20 rounded-md hover:bg-[#14532D]/10 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Swap</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveIngredientRow(ing.id)}
                          disabled={draft.ingredients.length <= 1}
                          aria-label={`Remove ${ing.item}`}
                          className="p-1.5 text-stone-400 hover:text-red-700 disabled:opacity-30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        {showShoppingSelector && (
                          <input
                            type="checkbox"
                            checked={selectedForShopping[ing.id] !== false}
                            onChange={(e) =>
                              setSelectedForShopping((prev) => ({
                                ...prev,
                                [ing.id]: e.target.checked,
                              }))
                            }
                            aria-label={`Select ${ing.item} for shopping list`}
                            className="mt-1 h-4 w-4 rounded border-stone-300 text-[#14532D] focus:ring-[#14532D]"
                          />
                        )}
                        <div>
                          <div className="text-sm text-stone-900 leading-snug">
                            {(displayQty || ing.unit) && (
                              <span className="font-mono tabular-nums font-medium text-stone-900 mr-1.5">
                                {[displayQty, ing.unit].filter(Boolean).join(' ')}
                              </span>
                            )}
                            <span className="font-medium">{ing.item}</span>
                            {ing.notes && (
                              <span className="text-stone-500">, {ing.notes}</span>
                            )}
                          </div>
                          {ing.substitutedFrom && (
                            <p className="text-[11px] text-[#14532D] mt-0.5">
                              Substituted for {ing.substitutedFrom}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleFetchSubstitutes(ing)}
                        title="Suggest culinary substitute"
                        className="text-[11px] font-medium text-stone-500 hover:text-[#14532D] whitespace-nowrap shrink-0"
                      >
                        Swap
                      </button>
                    </div>
                  )}

                  {/* Inline Culinary Substitute Suggestions */}
                  {swapTargetId === ing.id && (
                    <div className="pt-2.5 mt-2 border-t border-stone-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                          Suggested Substitutes for {ing.item}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSwapTargetId(null)}
                          className="text-stone-400 hover:text-stone-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {swapLoading && (
                        <div className="flex items-center gap-2 text-xs text-stone-500 py-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Calculating culinary ratios...</span>
                        </div>
                      )}

                      {swapError && (
                        <p className="text-xs text-red-700">{swapError}</p>
                      )}

                      {!swapLoading &&
                        swapSuggestions.map((sub, idx) => (
                          <div
                            key={`${sub.substituteItem}-${idx}`}
                            className="p-2.5 bg-stone-50 border border-stone-200 rounded-md flex items-start justify-between gap-3"
                          >
                            <div className="space-y-0.5">
                              <p className="text-xs font-medium text-stone-900">
                                <span className="font-mono tabular-nums">
                                  {[sub.quantity, sub.unit].filter(Boolean).join(' ')}{' '}
                                </span>
                                {sub.substituteItem}
                                {sub.notes ? `, ${sub.notes}` : ''}
                              </p>
                              <p className="text-[11px] text-stone-600">{sub.rationale}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => applySubstitute(ing.id, sub)}
                              className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#14532D] rounded hover:bg-[#166534] whitespace-nowrap shrink-0"
                            >
                              Apply
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleAddIngredientRow}
              className="text-xs font-medium text-[#14532D] hover:underline inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add ingredient</span>
            </button>

            {showShoppingSelector && (
              <button
                type="button"
                onClick={handleAddShopping}
                disabled={isAddingToShopping}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] transition-colors"
              >
                Add Selected to Shopping List
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Preparation Steps & Chef Notes */}
        <div className="lg:col-span-7 p-6 sm:p-8 space-y-8">
          <div className="space-y-5">
            <h3 className="font-editorial text-xl font-semibold text-stone-900">
              Method &amp; Instructions
            </h3>

            <ol className="space-y-6">
              {draft.steps.map((step) => (
                <li
                  key={step.stepNumber}
                  className="pb-6 border-b border-stone-100 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-baseline justify-between gap-4 mb-1.5">
                    <h4 className="text-base font-semibold text-stone-900">
                      <span className="font-mono tabular-nums text-xs text-stone-400 mr-2.5">
                        {String(step.stepNumber).padStart(2, '0')}.
                      </span>
                      {step.title}
                    </h4>
                    {step.durationMinutes > 0 && (
                      <span className="font-mono tabular-nums text-xs text-stone-500 whitespace-nowrap shrink-0">
                        {step.durationMinutes} min
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-stone-700 leading-relaxed max-w-prose">
                    {step.instruction}
                  </p>
                  {step.tip && (
                    <p className="mt-2 text-xs text-stone-500 italic">
                      Chef cue: {step.tip}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {/* Kitchen Notes */}
          <div className="pt-4 border-t border-stone-200 space-y-2">
            <label
              htmlFor="recipe-personal-notes"
              className="block text-xs font-medium uppercase tracking-wider text-stone-500"
            >
              Personal Notes &amp; Adaptations
            </label>
            <textarea
              id="recipe-personal-notes"
              rows={3}
              value={draft.notes}
              onChange={(e) => {
                setDraft((prev) => ({ ...prev, notes: e.target.value }));
                setHasUnsavedChanges(true);
              }}
              placeholder="Record oven adjustments, substitutions, or serving pairings..."
              className="w-full px-3.5 py-2.5 text-sm text-stone-800 bg-[#FAF9F6] border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
            />
          </div>

          {/* Delete Recipe Option when Saved */}
          {isSaved && onDeleteRecipe && (
            <div className="pt-4 border-t border-stone-200 flex items-center justify-between">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs font-medium text-stone-500 hover:text-red-700 transition-colors"
                >
                  Delete recipe from cookbook
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-red-700 font-medium">
                    Permanently delete this saved recipe?
                  </span>
                  <button
                    type="button"
                    onClick={() => void onDeleteRecipe()}
                    className="px-3 py-1 text-xs font-medium text-white bg-red-700 rounded hover:bg-red-800"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1 text-xs text-stone-600 hover:text-stone-900"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
