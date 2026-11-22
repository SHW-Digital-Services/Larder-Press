import React, { useMemo, useState } from 'react';
import { Search, ShoppingBasket, BookOpen, UtensilsCrossed, X } from 'lucide-react';
import type { RecipeDraft, RecipeIngredient, SavedRecipe } from '../types/recipe';
import type { User } from '../lib/firebase';
import { RecipeSheet } from './RecipeSheet';

const FALLBACK_COVER_IMAGE = '/src/assets/images/cookbook_editorial_cover_1795362217688.jpg';

interface CookbookViewProps {
  user: User | null;
  recipes: SavedRecipe[];
  loading: boolean;
  selectedRecipeId: string | null;
  onSelectRecipe: (id: string | null) => void;
  onUpdateRecipe: (recipeId: string, updated: RecipeDraft) => Promise<void>;
  onUpdateRecipeTags: (recipeId: string, tags: string[]) => Promise<void>;
  onDeleteRecipe: (recipeId: string) => Promise<void>;
  onAddToShoppingList: (
    ingredients: RecipeIngredient[],
    recipeTitle: string,
    recipeId: string
  ) => Promise<void>;
  onGoToConverter: () => void;
  onOpenAuth: () => void;
  isSaving: boolean;
  isAddingToShopping: boolean;
}

export const CookbookView: React.FC<CookbookViewProps> = ({
  user,
  recipes,
  loading,
  selectedRecipeId,
  onSelectRecipe,
  onUpdateRecipe,
  onUpdateRecipeTags,
  onDeleteRecipe,
  onAddToShoppingList,
  onGoToConverter,
  onOpenAuth,
  isSaving,
  isAddingToShopping,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string>('All');
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) || null,
    [recipes, selectedRecipeId]
  );

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) {
      for (const t of r.tags) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return recipes.filter((recipe) => {
      if (activeTag !== 'All') {
        const hasTag = recipe.tags.some((t) => t.toLowerCase() === activeTag.toLowerCase());
        if (!hasTag) return false;
      }

      if (!q) return true;

      const inTitle = recipe.title.toLowerCase().includes(q);
      const inTags = recipe.tags.some((t) => t.toLowerCase().includes(q));
      const inInstructions = recipe.steps.some(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.instruction.toLowerCase().includes(q) ||
          s.tip.toLowerCase().includes(q)
      );
      const inIngredients = recipe.ingredients.some((i) =>
        i.item.toLowerCase().includes(q)
      );
      const inNotes = recipe.notes.toLowerCase().includes(q);

      return inTitle || inTags || inInstructions || inIngredients || inNotes;
    });
  }, [recipes, searchQuery, activeTag]);

  if (!user) {
    return (
      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-12 items-stretch">
          <div className="md:col-span-7 p-8 flex flex-col justify-center space-y-4">
            <p className="text-xs font-medium uppercase tracking-widest text-stone-500">
              Saved Cookbook
            </p>
            <h1 className="font-editorial text-3xl font-semibold text-stone-900">
              Keep every converted video recipe organized in one place
            </h1>
            <p className="text-sm text-stone-600 leading-relaxed">
              Sign in with Google or Email &amp; Password to save recipes, customize ingredient
              quantities, tag by cuisine or speed, and search across instructions.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] transition-colors"
              >
                Sign In to Open Cookbook
              </button>
            </div>
          </div>
          <div className="md:col-span-5 min-h-[220px] bg-stone-100">
            <img
              src={FALLBACK_COVER_IMAGE}
              alt="Handmade pasta in stoneware bowl"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>
    );
  }

  if (selectedRecipe) {
    return (
      <div className="max-w-[1280px] mx-auto px-6 py-10">
        <RecipeSheet
          recipe={selectedRecipe}
          isSaved={true}
          isSaving={isSaving}
          isAddingToShopping={isAddingToShopping}
          onSaveRecipe={(updated) => onUpdateRecipe(selectedRecipe.id, updated)}
          onUpdateTags={(tags) => onUpdateRecipeTags(selectedRecipe.id, tags)}
          onDeleteRecipe={async () => {
            await onDeleteRecipe(selectedRecipe.id);
            onSelectRecipe(null);
          }}
          onAddToShoppingList={onAddToShoppingList}
          onBack={() => onSelectRecipe(null)}
        />
      </div>
    );
  }

  return (
    <section className="max-w-[1280px] mx-auto px-6 py-10 space-y-8">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-stone-500 mb-1.5">
            Personal Archive
          </p>
          <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-stone-900">
            Saved Recipes
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Search by dish title, category tags, ingredients, or keywords inside cooking steps.
          </p>
        </div>

        <div className="w-full md:w-96 relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search titles, tags, or instructions (e.g. simmer, garlic)..."
            aria-label="Search saved recipes"
            className="w-full pl-10 pr-9 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Bar */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter recipes by category">
          <button
            type="button"
            onClick={() => setActiveTag('All')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              activeTag === 'All'
                ? 'bg-stone-900 text-white border-stone-900'
                : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
            }`}
          >
            All ({recipes.length})
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                activeTag === tag
                  ? 'bg-[#14532D] text-white border-[#14532D]'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Loading / Empty / Grid States */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white border border-stone-200 rounded-xl overflow-hidden animate-pulse"
            >
              <div className="aspect-[4/3] bg-stone-200" />
              <div className="p-5 space-y-3">
                <div className="h-3 w-1/3 bg-stone-200 rounded" />
                <div className="h-5 w-3/4 bg-stone-200 rounded" />
                <div className="h-3 w-full bg-stone-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-10 text-center max-w-xl mx-auto space-y-4">
          <BookOpen className="w-8 h-8 text-stone-400 mx-auto" />
          <h2 className="font-editorial text-2xl font-semibold text-stone-900">
            Your cookbook is waiting for its first recipe
          </h2>
          <p className="text-sm text-stone-600">
            Convert any online cooking video into a structured written recipe, edit ingredients to
            taste, and save it here.
          </p>
          <button
            type="button"
            onClick={onGoToConverter}
            className="px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] transition-colors"
          >
            Convert a Cooking Video
          </button>
        </div>
      ) : filteredRecipes.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-10 text-center space-y-3">
          <UtensilsCrossed className="w-7 h-7 text-stone-400 mx-auto" />
          <h2 className="text-lg font-semibold text-stone-900">No matching recipes found</h2>
          <p className="text-sm text-stone-600">
            Try clearing your search query or switching back to All categories.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setActiveTag('All');
            }}
            className="px-4 py-2 text-xs font-medium text-stone-800 bg-stone-100 border border-stone-300 rounded-lg hover:bg-stone-200"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map((recipe) => {
            const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes;
            const imgSrc =
              recipe.thumbnailUrl && !brokenThumbs[recipe.id]
                ? recipe.thumbnailUrl
                : FALLBACK_COVER_IMAGE;

            return (
              <article
                key={recipe.id}
                className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col justify-between hover:border-stone-400 transition-colors"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => onSelectRecipe(recipe.id)}
                    className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14532D]"
                  >
                    <div className="aspect-[4/3] bg-stone-100 overflow-hidden border-b border-stone-200">
                      <img
                        src={imgSrc}
                        alt={recipe.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenThumbs((prev) => ({ ...prev, [recipe.id]: true }))
                        }
                        className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-300"
                      />
                    </div>
                  </button>

                  <div className="p-5 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                      <span>{recipe.videoPlatform}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{totalTime} min</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{recipe.servings} servings</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectRecipe(recipe.id)}
                      className="block text-left"
                    >
                      <h2 className="font-editorial text-xl font-semibold text-stone-900 hover:text-[#14532D] transition-colors line-clamp-2">
                        {recipe.title}
                      </h2>
                    </button>

                    {recipe.summary && (
                      <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                        {recipe.summary}
                      </p>
                    )}

                    {recipe.tags.length > 0 && (
                      <p className="text-[11px] font-medium text-stone-500 pt-1">
                        {recipe.tags.join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="px-5 py-3.5 border-t border-stone-100 bg-stone-50/50 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectRecipe(recipe.id)}
                    className="text-xs font-semibold text-stone-900 hover:text-[#14532D] transition-colors whitespace-nowrap"
                  >
                    Open &amp; Edit &rarr;
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void onAddToShoppingList(recipe.ingredients, recipe.title, recipe.id)
                    }
                    disabled={isAddingToShopping}
                    className="text-xs font-medium text-[#14532D] hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <ShoppingBasket className="w-3.5 h-3.5" />
                    <span>Add to List</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
