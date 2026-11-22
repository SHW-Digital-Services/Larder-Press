/**
 * Security Rules Specification Verification Matrix for Larder Press
 * Verifies the "Dirty Dozen" adversarial payloads documented in security_spec.md.
 */
export interface AdversarialPayloadCase {
  id: number;
  name: string;
  collection: 'users' | 'recipes' | 'shoppingItems';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedResult: 'PERMISSION_DENIED';
  payloadSummary: string;
}

export const DIRTY_DOZEN_CASES: AdversarialPayloadCase[] = [
  { id: 1, name: 'Unauthenticated access', collection: 'recipes', operation: 'get', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'auth == null' },
  { id: 2, name: 'Unverified email write', collection: 'recipes', operation: 'create', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'token.email_verified == false' },
  { id: 3, name: 'Cross-user PII read', collection: 'users', operation: 'get', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'uid != userId' },
  { id: 4, name: 'Unscoped recipe list query', collection: 'recipes', operation: 'list', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'missing ownerId == auth.uid filter' },
  { id: 5, name: 'Owner spoofing on create', collection: 'recipes', operation: 'create', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'ownerId = "other-user"' },
  { id: 6, name: 'Shadow ghost field injection', collection: 'recipes', operation: 'create', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'extra key isVerified: true' },
  { id: 7, name: 'Immutable owner/createdAt mutation', collection: 'recipes', operation: 'update', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'modified ownerId or createdAt' },
  { id: 8, name: 'Invalid path ID poisoning', collection: 'recipes', operation: 'create', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'id contains invalid chars or > 128 chars' },
  { id: 9, name: 'Backdated timestamp spoofing', collection: 'recipes', operation: 'create', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'createdAt != request.time' },
  { id: 10, name: 'Empty ingredients or oversized tags', collection: 'recipes', operation: 'update', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'ingredients.size() == 0 or tags.size() > 12' },
  { id: 11, name: 'Type poisoning on shoppingItem', collection: 'shoppingItems', operation: 'update', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'purchased = "yes" instead of boolean' },
  { id: 12, name: 'Cross-user shopping item delete', collection: 'shoppingItems', operation: 'delete', expectedResult: 'PERMISSION_DENIED', payloadSummary: 'existing.ownerId != auth.uid' },
];
