import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import {
  auth,
  signOut,
  sendEmailVerification,
  upsertUserProfile,
  subscribeToRecipes,
  subscribeToShoppingItems,
  createSavedRecipe,
  updateSavedRecipeFull,
  updateSavedRecipeTags,
  deleteSavedRecipe,
  addIngredientsToShoppingList,
  addCustomShoppingItem,
  toggleShoppingItemPurchased,
  updateShoppingItemDetails,
  deleteShoppingItem,
  clearPurchasedShoppingItems,
  type User,
} from './lib/firebase';
import type {
  RecipeDraft,
  RecipeIngredient,
  SavedRecipe,
  ShoppingItem,
} from './types/recipe';
import { TopBar, type ActiveView } from './components/TopBar';
import { VideoConverter } from './components/VideoConverter';
import { CookbookView } from './components/CookbookView';
import { ShoppingListView } from './components/ShoppingListView';
import { AccountSecurityView } from './components/AccountSecurityView';
import { AuthModal } from './components/AuthModal';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('converter');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authContextMessage, setAuthContextMessage] = useState<string | undefined>(undefined);

  const [currentDraft, setCurrentDraft] = useState<RecipeDraft | null>(null);
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);

  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [shoppingLoading, setShoppingLoading] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isAddingToShopping, setIsAddingToShopping] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const pendingSaveDraftRef = useRef<RecipeDraft | null>(null);
  const pendingShoppingRef = useRef<{
    ingredients: RecipeIngredient[];
    recipeTitle: string;
    recipeId: string;
  } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 3600);
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);

      if (firebaseUser && firebaseUser.emailVerified) {
        try {
          await upsertUserProfile(firebaseUser);
        } catch (err) {
          console.error('Failed to sync profile:', err);
        }
      } else if (!firebaseUser) {
        setRecipes([]);
        setShoppingItems([]);
        setSelectedRecipeId(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore real-time subscriptions (only when verified user is signed in)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setRecipes([]);
      setShoppingItems([]);
      setRecipesLoading(false);
      setShoppingLoading(false);
      return;
    }

    setRecipesLoading(true);
    setShoppingLoading(true);

    const unsubRecipes = subscribeToRecipes(
      user.uid,
      (list) => {
        setRecipes(list);
        setRecipesLoading(false);
      },
      (err) => {
        setRecipesLoading(false);
        showToast('error', err.message);
      }
    );

    const unsubShopping = subscribeToShoppingItems(
      user.uid,
      (list) => {
        setShoppingItems(list);
        setShoppingLoading(false);
      },
      (err) => {
        setShoppingLoading(false);
        showToast('error', err.message);
      }
    );

    return () => {
      unsubRecipes();
      unsubShopping();
    };
  }, [authReady, user, showToast]);

  const handleSaveDraft = async (draftToSave: RecipeDraft) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      pendingSaveDraftRef.current = draftToSave;
      setAuthContextMessage('Sign in or create an account to save this recipe to your cookbook.');
      setAuthModalOpen(true);
      return;
    }

    if (!currentUser.emailVerified) {
      showToast('error', 'Please verify your email address first using the banner above.');
      return;
    }

    setIsSaving(true);
    try {
      const newId = await createSavedRecipe(currentUser.uid, draftToSave);
      setCurrentDraft(null);
      setSelectedRecipeId(newId);
      setActiveView('cookbook');
      showToast('success', `"${draftToSave.title}" saved to your cookbook.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save recipe.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateRecipe = async (recipeId: string, updated: RecipeDraft) => {
    setIsSaving(true);
    try {
      await updateSavedRecipeFull(recipeId, updated);
      showToast('success', 'Recipe changes saved.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update recipe.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateRecipeTags = async (recipeId: string, tags: string[]) => {
    try {
      await updateSavedRecipeTags(recipeId, tags);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update tags.');
    }
  };

  const handleDeleteRecipe = async (recipeId: string) => {
    try {
      await deleteSavedRecipe(recipeId);
      showToast('success', 'Recipe removed from your cookbook.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete recipe.');
    }
  };

  const handleAddToShoppingList = async (
    ingredients: RecipeIngredient[],
    recipeTitle: string,
    recipeId: string
  ) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      pendingShoppingRef.current = { ingredients, recipeTitle, recipeId };
      setAuthContextMessage('Sign in to compile these ingredients into your shopping list.');
      setAuthModalOpen(true);
      return;
    }

    if (!currentUser.emailVerified) {
      showToast('error', 'Please verify your email address first to sync your shopping list.');
      return;
    }

    setIsAddingToShopping(true);
    try {
      const { addedCount, mergedCount } = await addIngredientsToShoppingList(
        currentUser.uid,
        recipeId,
        recipeTitle,
        ingredients,
        shoppingItems
      );
      const summary = [
        addedCount > 0 ? `${addedCount} new item${addedCount === 1 ? '' : 's'} added` : '',
        mergedCount > 0 ? `${mergedCount} existing updated` : '',
      ]
        .filter(Boolean)
        .join(', ');
      showToast('success', summary || 'Shopping list updated.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update shopping list.');
    } finally {
      setIsAddingToShopping(false);
    }
  };

  const handleAuthSuccess = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    await currentUser.reload();
    setUser(auth.currentUser);

    if (auth.currentUser?.emailVerified) {
      await upsertUserProfile(auth.currentUser);

      if (pendingSaveDraftRef.current) {
        const draft = pendingSaveDraftRef.current;
        pendingSaveDraftRef.current = null;
        await handleSaveDraft(draft);
      }

      if (pendingShoppingRef.current) {
        const pending = pendingShoppingRef.current;
        pendingShoppingRef.current = null;
        await handleAddToShoppingList(
          pending.ingredients,
          pending.recipeTitle,
          pending.recipeId
        );
      }
    }
  };

  const handleRefreshUser = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setUser({ ...auth.currentUser } as User);
    if (auth.currentUser.emailVerified) {
      await upsertUserProfile(auth.currentUser);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setActiveView('converter');
    showToast('success', 'Signed out.');
  };

  const shoppingRemainingCount = shoppingItems.filter((i) => !i.purchased).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#18181B]">
      <TopBar
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
          if (view !== 'cookbook') {
            setSelectedRecipeId(null);
          }
        }}
        savedCount={recipes.length}
        shoppingRemainingCount={shoppingRemainingCount}
        user={user}
        onOpenAuth={() => {
          setAuthContextMessage(undefined);
          setAuthModalOpen(true);
        }}
        onSignOut={handleSignOut}
      />

      {/* Verification Reminder for Email/Password Users */}
      {user && !user.emailVerified && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="max-w-[1280px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Verify your email ({user.email}) to unlock cloud recipe saving, shopping list sync,
                and MFA setup.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await sendEmailVerification(user);
                  showToast('success', `Verification link sent to ${user.email}`);
                }}
                className="px-3 py-1 font-medium bg-white border border-amber-300 rounded hover:bg-amber-100"
              >
                Resend Link
              </button>
              <button
                type="button"
                onClick={() => void handleRefreshUser()}
                className="px-3 py-1 font-medium text-white bg-amber-900 rounded hover:bg-amber-950 inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>I&apos;ve Verified</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm">
          <div
            role="status"
            className={`px-4 py-3 rounded-lg border shadow-lg text-xs font-medium flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-white border-[#14532D]/30 text-stone-900'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#14532D] shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      <main className="flex-1">
        {activeView === 'converter' && (
          <VideoConverter
            currentDraft={currentDraft}
            onDraftGenerated={(draft) => setCurrentDraft(draft)}
            onSaveDraft={handleSaveDraft}
            onAddToShoppingList={handleAddToShoppingList}
            isSaving={isSaving}
            isAddingToShopping={isAddingToShopping}
          />
        )}

        {activeView === 'cookbook' && (
          <CookbookView
            user={user}
            recipes={recipes}
            loading={recipesLoading}
            selectedRecipeId={selectedRecipeId}
            onSelectRecipe={setSelectedRecipeId}
            onUpdateRecipe={handleUpdateRecipe}
            onUpdateRecipeTags={handleUpdateRecipeTags}
            onDeleteRecipe={handleDeleteRecipe}
            onAddToShoppingList={handleAddToShoppingList}
            onGoToConverter={() => setActiveView('converter')}
            onOpenAuth={() => {
              setAuthContextMessage('Sign in to access your saved recipes.');
              setAuthModalOpen(true);
            }}
            isSaving={isSaving}
            isAddingToShopping={isAddingToShopping}
          />
        )}

        {activeView === 'shopping' && (
          <ShoppingListView
            user={user}
            items={shoppingItems}
            loading={shoppingLoading}
            onTogglePurchased={(itemId, purchased) =>
              toggleShoppingItemPurchased(itemId, purchased)
            }
            onAddCustomItem={async (item, qty, unit, cat) => {
              if (!user || !user.emailVerified) return;
              await addCustomShoppingItem(user.uid, item, qty, unit, cat);
            }}
            onUpdateItem={(itemId, updates) =>
              updateShoppingItemDetails(itemId, updates)
            }
            onDeleteItem={(itemId) => deleteShoppingItem(itemId)}
            onClearPurchased={() => clearPurchasedShoppingItems(shoppingItems)}
            onOpenAuth={() => {
              setAuthContextMessage('Sign in to access your shopping list.');
              setAuthModalOpen(true);
            }}
            onGoToCookbook={() => setActiveView('cookbook')}
          />
        )}

        {activeView === 'security' && (
          <AccountSecurityView
            user={user}
            onOpenAuth={() => {
              setAuthContextMessage('Sign in or create an account to manage security & MFA.');
              setAuthModalOpen(true);
            }}
            onUserRefreshed={handleRefreshUser}
          />
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white/60 mt-16">
        <div className="max-w-[1280px] mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <p className="font-editorial text-sm text-stone-800">Larder Press</p>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveView('converter')}
              className="hover:text-stone-900"
            >
              Convert Video
            </button>
            <button
              type="button"
              onClick={() => setActiveView('cookbook')}
              className="hover:text-stone-900"
            >
              Saved Recipes
            </button>
            <button
              type="button"
              onClick={() => setActiveView('shopping')}
              className="hover:text-stone-900"
            >
              Shopping List
            </button>
            <button
              type="button"
              onClick={() => setActiveView('security')}
              className="hover:text-stone-900"
            >
              Security &amp; MFA
            </button>
          </div>
        </div>
      </footer>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
        contextMessage={authContextMessage}
      />
    </div>
  );
}
