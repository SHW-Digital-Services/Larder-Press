export type DifficultyLevel = 'Easy' | 'Medium' | 'Challenging';

export type ShoppingCategory =
  | 'Produce'
  | 'Dairy & Eggs'
  | 'Meat & Seafood'
  | 'Bakery & Grains'
  | 'Spices & Oils'
  | 'Pantry'
  | 'Other';

export interface RecipeIngredient {
  id: string;
  quantity: string;
  unit: string;
  item: string;
  notes: string;
  substitutedFrom?: string;
}

export interface RecipeStep {
  stepNumber: number;
  title: string;
  instruction: string;
  durationMinutes: number;
  tip: string;
}

export interface RecipeDraft {
  title: string;
  summary: string;
  sourceUrl: string;
  videoPlatform: string;
  creatorName: string;
  thumbnailUrl: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  difficulty: DifficultyLevel;
  tags: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  notes: string;
}

export interface SavedRecipe extends RecipeDraft {
  id: string;
  ownerId: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ShoppingItem {
  id: string;
  ownerId: string;
  item: string;
  quantity: string;
  unit: string;
  notes: string;
  category: ShoppingCategory;
  recipeId: string;
  recipeTitle: string;
  purchased: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
}

export interface SubstituteSuggestion {
  substituteItem: string;
  quantity: string;
  unit: string;
  notes: string;
  rationale: string;
}
