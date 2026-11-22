import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  multiFactor,
  TotpMultiFactorGenerator,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  getMultiFactorResolver,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  type User,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  RecipeDraft,
  RecipeIngredient,
  RecipeStep,
  SavedRecipe,
  ShoppingCategory,
  ShoppingItem,
} from '../types/recipe';
import { categorizeIngredient, combineQuantities, normalizeItemKey } from './ingredientParser';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: the client is offline.');
    }
  }
}

void testConnection();

export function createSafeId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${raw}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
}

function sanitizeIngredients(ingredients: RecipeIngredient[]): RecipeIngredient[] {
  const cleaned = ingredients
    .slice(0, 60)
    .map((ing, idx) => {
      const base: RecipeIngredient = {
        id: (ing.id || `ing-${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || `ing-${idx + 1}`,
        quantity: String(ing.quantity ?? '').trim().slice(0, 40),
        unit: String(ing.unit ?? '').trim().slice(0, 40),
        item: String(ing.item ?? '').trim().slice(0, 200),
        notes: String(ing.notes ?? '').trim().slice(0, 200),
      };
      if (ing.substitutedFrom && ing.substitutedFrom.trim()) {
        base.substitutedFrom = ing.substitutedFrom.trim().slice(0, 200);
      }
      return base;
    })
    .filter((ing) => ing.item.length > 0);

  if (cleaned.length === 0) {
    return [
      {
        id: 'ing-1',
        quantity: '1',
        unit: '',
        item: 'Ingredient to taste',
        notes: '',
      },
    ];
  }
  return cleaned;
}

function sanitizeSteps(steps: RecipeStep[]): RecipeStep[] {
  const cleaned = steps
    .slice(0, 40)
    .map((st, idx) => ({
      stepNumber: idx + 1,
      title: String(st.title ?? `Step ${idx + 1}`).trim().slice(0, 120) || `Step ${idx + 1}`,
      instruction: String(st.instruction ?? '').trim().slice(0, 2000),
      durationMinutes: Math.max(0, Math.min(1440, Math.round(Number(st.durationMinutes) || 0))),
      tip: String(st.tip ?? '').trim().slice(0, 400),
    }))
    .filter((st) => st.instruction.length > 0);

  if (cleaned.length === 0) {
    return [
      {
        stepNumber: 1,
        title: 'Prepare Dish',
        instruction: 'Follow the cooking video steps and serve warm.',
        durationMinutes: 10,
        tip: '',
      },
    ];
  }
  return cleaned;
}

function sanitizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const clean = tag.trim().slice(0, 40);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
    if (out.length >= 12) break;
  }
  return out;
}

export async function upsertUserProfile(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const userRef = doc(db, 'users', user.uid);
  try {
    const existingSnap = await getDoc(userRef);
    const payload = {
      uid: user.uid,
      displayName: (user.displayName || user.email?.split('@')[0] || 'Chef').slice(0, 120),
      email: (user.email || '').slice(0, 254),
      photoURL: (user.photoURL || '').slice(0, 500),
      updatedAt: serverTimestamp(),
    };

    if (!existingSnap.exists()) {
      await setDoc(userRef, {
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

function timestampToMs(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as Timestamp).toMillis === 'function') {
    return (value as Timestamp).toMillis();
  }
  return Date.now();
}

export function subscribeToRecipes(
  uid: string,
  onData: (recipes: SavedRecipe[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'recipes';
  const q = query(collection(db, path), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedRecipe[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: String(d.id || docSnap.id),
          ownerId: String(d.ownerId || uid),
          title: String(d.title || 'Untitled Recipe'),
          summary: String(d.summary || ''),
          sourceUrl: String(d.sourceUrl || ''),
          videoPlatform: String(d.videoPlatform || 'Online Video'),
          creatorName: String(d.creatorName || ''),
          thumbnailUrl: String(d.thumbnailUrl || ''),
          prepTimeMinutes: Number(d.prepTimeMinutes || 0),
          cookTimeMinutes: Number(d.cookTimeMinutes || 0),
          servings: Number(d.servings || 1),
          difficulty:
            d.difficulty === 'Easy' || d.difficulty === 'Challenging' ? d.difficulty : 'Medium',
          tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
          ingredients: Array.isArray(d.ingredients) ? (d.ingredients as RecipeIngredient[]) : [],
          steps: Array.isArray(d.steps) ? (d.steps as RecipeStep[]) : [],
          notes: String(d.notes || ''),
          createdAtMs: timestampToMs(d.createdAt),
          updatedAtMs: timestampToMs(d.updatedAt),
        };
      });
      items.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createSavedRecipe(uid: string, draft: RecipeDraft): Promise<string> {
  const recipeId = createSafeId('rcp');
  const path = `recipes/${recipeId}`;
  try {
    await setDoc(doc(db, 'recipes', recipeId), {
      id: recipeId,
      ownerId: uid,
      title: (draft.title.trim() || 'Untitled Recipe').slice(0, 160),
      summary: draft.summary.trim().slice(0, 800),
      sourceUrl: draft.sourceUrl.trim().slice(0, 1000),
      videoPlatform: (draft.videoPlatform.trim() || 'Online Video').slice(0, 60),
      creatorName: draft.creatorName.trim().slice(0, 120),
      thumbnailUrl: draft.thumbnailUrl.trim().slice(0, 1000),
      prepTimeMinutes: Math.max(0, Math.min(1440, Math.round(draft.prepTimeMinutes || 0))),
      cookTimeMinutes: Math.max(0, Math.min(2880, Math.round(draft.cookTimeMinutes || 0))),
      servings: Math.max(1, Math.min(100, Math.round(draft.servings || 1))),
      difficulty:
        draft.difficulty === 'Easy' || draft.difficulty === 'Challenging'
          ? draft.difficulty
          : 'Medium',
      tags: sanitizeTags(draft.tags),
      ingredients: sanitizeIngredients(draft.ingredients),
      steps: sanitizeSteps(draft.steps),
      notes: draft.notes.trim().slice(0, 2000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return recipeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateSavedRecipeIngredients(
  recipeId: string,
  ingredients: RecipeIngredient[],
  servings: number,
  notes: string
): Promise<void> {
  const path = `recipes/${recipeId}`;
  try {
    await updateDoc(doc(db, 'recipes', recipeId), {
      ingredients: sanitizeIngredients(ingredients),
      servings: Math.max(1, Math.min(100, Math.round(servings || 1))),
      notes: notes.trim().slice(0, 2000),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateSavedRecipeTags(recipeId: string, tags: string[]): Promise<void> {
  const path = `recipes/${recipeId}`;
  try {
    await updateDoc(doc(db, 'recipes', recipeId), {
      tags: sanitizeTags(tags),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateSavedRecipeFull(recipeId: string, draft: RecipeDraft): Promise<void> {
  const path = `recipes/${recipeId}`;
  try {
    await updateDoc(doc(db, 'recipes', recipeId), {
      title: (draft.title.trim() || 'Untitled Recipe').slice(0, 160),
      summary: draft.summary.trim().slice(0, 800),
      prepTimeMinutes: Math.max(0, Math.min(1440, Math.round(draft.prepTimeMinutes || 0))),
      cookTimeMinutes: Math.max(0, Math.min(2880, Math.round(draft.cookTimeMinutes || 0))),
      servings: Math.max(1, Math.min(100, Math.round(draft.servings || 1))),
      difficulty:
        draft.difficulty === 'Easy' || draft.difficulty === 'Challenging'
          ? draft.difficulty
          : 'Medium',
      tags: sanitizeTags(draft.tags),
      ingredients: sanitizeIngredients(draft.ingredients),
      steps: sanitizeSteps(draft.steps),
      notes: draft.notes.trim().slice(0, 2000),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteSavedRecipe(recipeId: string): Promise<void> {
  const path = `recipes/${recipeId}`;
  try {
    await deleteDoc(doc(db, 'recipes', recipeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToShoppingItems(
  uid: string,
  onData: (items: ShoppingItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'shoppingItems';
  const q = query(collection(db, path), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: ShoppingItem[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: String(d.id || docSnap.id),
          ownerId: String(d.ownerId || uid),
          item: String(d.item || ''),
          quantity: String(d.quantity || ''),
          unit: String(d.unit || ''),
          notes: String(d.notes || ''),
          category: (String(d.category || 'Other') as ShoppingCategory) || 'Other',
          recipeId: String(d.recipeId || ''),
          recipeTitle: String(d.recipeTitle || ''),
          purchased: Boolean(d.purchased),
          createdAtMs: timestampToMs(d.createdAt),
          updatedAtMs: timestampToMs(d.updatedAt),
        };
      });
      items.sort((a, b) => {
        if (a.purchased !== b.purchased) return a.purchased ? 1 : -1;
        return b.createdAtMs - a.createdAtMs;
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function addIngredientsToShoppingList(
  uid: string,
  recipeId: string,
  recipeTitle: string,
  ingredients: RecipeIngredient[],
  existingItems: ShoppingItem[]
): Promise<{ addedCount: number; mergedCount: number }> {
  const batch = writeBatch(db);
  const existingByKey = new Map<string, ShoppingItem>();
  for (const item of existingItems) {
    if (!item.purchased) {
      existingByKey.set(normalizeItemKey(item.item, item.unit), item);
    }
  }

  let addedCount = 0;
  let mergedCount = 0;

  for (const ing of ingredients) {
    const cleanName = ing.item.trim().slice(0, 200);
    if (!cleanName) continue;
    const cleanUnit = ing.unit.trim().slice(0, 40);
    const cleanQty = ing.quantity.trim().slice(0, 40);
    const cleanNotes = ing.notes.trim().slice(0, 200);
    const key = normalizeItemKey(cleanName, cleanUnit);

    const match = existingByKey.get(key);
    if (match) {
      const mergedQty = combineQuantities(match.quantity, cleanQty).slice(0, 40);
      const ref = doc(db, 'shoppingItems', match.id);
      batch.update(ref, {
        item: match.item,
        quantity: mergedQty,
        unit: match.unit,
        notes: match.notes || cleanNotes,
        category: match.category,
        purchased: false,
        updatedAt: serverTimestamp(),
      });
      match.quantity = mergedQty;
      mergedCount += 1;
    } else {
      const itemId = createSafeId('shp');
      const ref = doc(db, 'shoppingItems', itemId);
      const category = categorizeIngredient(cleanName);
      batch.set(ref, {
        id: itemId,
        ownerId: uid,
        item: cleanName,
        quantity: cleanQty,
        unit: cleanUnit,
        notes: cleanNotes,
        category,
        recipeId: (recipeId || 'custom').slice(0, 128),
        recipeTitle: (recipeTitle || 'Custom').slice(0, 160),
        purchased: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      existingByKey.set(key, {
        id: itemId,
        ownerId: uid,
        item: cleanName,
        quantity: cleanQty,
        unit: cleanUnit,
        notes: cleanNotes,
        category,
        recipeId,
        recipeTitle,
        purchased: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      addedCount += 1;
    }
  }

  try {
    await batch.commit();
    return { addedCount, mergedCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'shoppingItems');
  }
}

export async function addCustomShoppingItem(
  uid: string,
  item: string,
  quantity: string,
  unit: string,
  category?: ShoppingCategory
): Promise<void> {
  const itemId = createSafeId('shp');
  const cleanName = item.trim().slice(0, 200);
  if (!cleanName) return;
  try {
    await setDoc(doc(db, 'shoppingItems', itemId), {
      id: itemId,
      ownerId: uid,
      item: cleanName,
      quantity: quantity.trim().slice(0, 40),
      unit: unit.trim().slice(0, 40),
      notes: '',
      category: (category || categorizeIngredient(cleanName)).slice(0, 60),
      recipeId: 'manual',
      recipeTitle: 'Manual Entry',
      purchased: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `shoppingItems/${itemId}`);
  }
}

export async function toggleShoppingItemPurchased(itemId: string, purchased: boolean): Promise<void> {
  const path = `shoppingItems/${itemId}`;
  try {
    await updateDoc(doc(db, 'shoppingItems', itemId), {
      purchased,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateShoppingItemDetails(
  itemId: string,
  updates: {
    item: string;
    quantity: string;
    unit: string;
    notes: string;
    category: ShoppingCategory;
    purchased: boolean;
  }
): Promise<void> {
  const path = `shoppingItems/${itemId}`;
  try {
    await updateDoc(doc(db, 'shoppingItems', itemId), {
      item: updates.item.trim().slice(0, 200),
      quantity: updates.quantity.trim().slice(0, 40),
      unit: updates.unit.trim().slice(0, 40),
      notes: updates.notes.trim().slice(0, 200),
      category: updates.category.slice(0, 60),
      purchased: Boolean(updates.purchased),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteShoppingItem(itemId: string): Promise<void> {
  const path = `shoppingItems/${itemId}`;
  try {
    await deleteDoc(doc(db, 'shoppingItems', itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function clearPurchasedShoppingItems(items: ShoppingItem[]): Promise<void> {
  const purchased = items.filter((i) => i.purchased);
  if (purchased.length === 0) return;
  const batch = writeBatch(db);
  for (const item of purchased) {
    batch.delete(doc(db, 'shoppingItems', item.id));
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'shoppingItems');
  }
}

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  multiFactor,
  TotpMultiFactorGenerator,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  getMultiFactorResolver,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  firebaseConfig,
};
export type { User, MultiFactorError, MultiFactorResolver, TotpSecret };
