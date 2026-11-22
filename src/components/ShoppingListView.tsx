import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Plus,
  ShoppingBasket,
  Trash2,
  Edit2,
  X,
} from 'lucide-react';
import type { ShoppingCategory, ShoppingItem } from '../types/recipe';
import type { User } from '../lib/firebase';

const MARKET_IMAGE_PATH = '/src/assets/images/market_ingredients_flatlay_1795362217852.jpg';

const CATEGORIES: ShoppingCategory[] = [
  'Produce',
  'Dairy & Eggs',
  'Meat & Seafood',
  'Bakery & Grains',
  'Spices & Oils',
  'Pantry',
  'Other',
];

interface ShoppingListViewProps {
  user: User | null;
  items: ShoppingItem[];
  loading: boolean;
  onTogglePurchased: (itemId: string, purchased: boolean) => Promise<void>;
  onAddCustomItem: (
    item: string,
    quantity: string,
    unit: string,
    category: ShoppingCategory
  ) => Promise<void>;
  onUpdateItem: (
    itemId: string,
    updates: {
      item: string;
      quantity: string;
      unit: string;
      notes: string;
      category: ShoppingCategory;
      purchased: boolean;
    }
  ) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onClearPurchased: () => Promise<void>;
  onOpenAuth: () => void;
  onGoToCookbook: () => void;
}

export const ShoppingListView: React.FC<ShoppingListViewProps> = ({
  user,
  items,
  loading,
  onTogglePurchased,
  onAddCustomItem,
  onUpdateItem,
  onDeleteItem,
  onClearPurchased,
  onOpenAuth,
  onGoToCookbook,
}) => {
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<ShoppingCategory>('Produce');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editName, setEditName] = useState('');
  const [copied, setCopied] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'remaining' | 'purchased'>('all');

  const remainingCount = useMemo(
    () => items.filter((i) => !i.purchased).length,
    [items]
  );
  const purchasedCount = items.length - remainingCount;

  const groupedItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (filterMode === 'remaining') return !item.purchased;
      if (filterMode === 'purchased') return item.purchased;
      return true;
    });

    const groups = new Map<ShoppingCategory, ShoppingItem[]>();
    for (const cat of CATEGORIES) {
      groups.set(cat, []);
    }
    for (const item of filtered) {
      const cat = CATEGORIES.includes(item.category) ? item.category : 'Other';
      groups.get(cat)!.push(item);
    }
    return [...groups.entries()].filter(([, list]) => list.length > 0);
  }, [items, filterMode]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    await onAddCustomItem(newItemName, newItemQty, newItemUnit, newItemCategory);
    setNewItemName('');
    setNewItemQty('1');
    setNewItemUnit('');
  };

  const startEdit = (item: ShoppingItem) => {
    setEditingId(item.id);
    setEditQty(item.quantity);
    setEditUnit(item.unit);
    setEditName(item.item);
  };

  const saveEdit = async (item: ShoppingItem) => {
    if (!editName.trim()) return;
    await onUpdateItem(item.id, {
      item: editName,
      quantity: editQty,
      unit: editUnit,
      notes: item.notes,
      category: item.category,
      purchased: item.purchased,
    });
    setEditingId(null);
  };

  const handleCopyList = async () => {
    const lines = items
      .filter((i) => !i.purchased)
      .map((i) => `- [ ] ${[i.quantity, i.unit, i.item].filter(Boolean).join(' ')}`);
    await navigator.clipboard.writeText(lines.join('\n') || 'Shopping list is empty.');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!user) {
    return (
      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-12 items-stretch">
          <div className="md:col-span-7 p-8 flex flex-col justify-center space-y-4">
            <p className="text-xs font-medium uppercase tracking-widest text-stone-500">
              Market &amp; Pantry List
            </p>
            <h1 className="font-editorial text-3xl font-semibold text-stone-900">
              Compile ingredients into an organized grocery checklist
            </h1>
            <p className="text-sm text-stone-600 leading-relaxed">
              Sign in to send ingredients directly from any converted or saved recipe into a
              persistent shopping list organized by grocery aisle.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] transition-colors"
              >
                Sign In to Use Shopping List
              </button>
            </div>
          </div>
          <div className="md:col-span-5 min-h-[220px] bg-stone-100">
            <img
              src={MARKET_IMAGE_PATH}
              alt="Fresh market ingredients arranged on linen"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-stone-500 mb-1.5">
            Market Checklist
          </p>
          <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-stone-900">
            Shopping List
          </h1>
          <p className="text-sm text-stone-600 mt-1 font-mono tabular-nums">
            {remainingCount} to buy · {purchasedCount} purchased
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
            {(['all', 'remaining', 'purchased'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                  filterMode === mode
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopyList}
            disabled={remainingCount === 0}
            className="px-3.5 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 disabled:opacity-40 flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#14532D]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy List'}</span>
          </button>

          {purchasedCount > 0 && (
            <button
              type="button"
              onClick={() => void onClearPurchased()}
              className="px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50"
            >
              Clear Purchased ({purchasedCount})
            </button>
          )}
        </div>
      </div>

      {/* Add Custom Item Bar */}
      <form
        onSubmit={handleAddSubmit}
        className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
      >
        <div className="sm:col-span-2">
          <label htmlFor="shop-qty" className="block text-[11px] font-medium text-stone-600 mb-1">
            Qty
          </label>
          <input
            id="shop-qty"
            type="text"
            value={newItemQty}
            onChange={(e) => setNewItemQty(e.target.value)}
            placeholder="2"
            className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="shop-unit" className="block text-[11px] font-medium text-stone-600 mb-1">
            Unit
          </label>
          <input
            id="shop-unit"
            type="text"
            value={newItemUnit}
            onChange={(e) => setNewItemUnit(e.target.value)}
            placeholder="cups"
            className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
          />
        </div>
        <div className="sm:col-span-4">
          <label htmlFor="shop-item" className="block text-[11px] font-medium text-stone-600 mb-1">
            Ingredient or Item
          </label>
          <input
            id="shop-item"
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Olive oil, flaky sea salt..."
            className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="shop-cat" className="block text-[11px] font-medium text-stone-600 mb-1">
            Aisle
          </label>
          <select
            id="shop-cat"
            value={newItemCategory}
            onChange={(e) => setNewItemCategory(e.target.value as ShoppingCategory)}
            className="w-full px-2.5 py-2 text-xs border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#14532D]"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={!newItemName.trim()}
            className="w-full py-2 px-3 text-xs font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </button>
        </div>
      </form>

      {/* Shopping List Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-12 bg-white border border-stone-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-12 items-stretch">
          <div className="md:col-span-7 p-8 flex flex-col justify-center space-y-3">
            <ShoppingBasket className="w-7 h-7 text-stone-400" />
            <h2 className="font-editorial text-2xl font-semibold text-stone-900">
              Your shopping list is empty
            </h2>
            <p className="text-sm text-stone-600 leading-relaxed">
              Open any saved recipe and click <strong>Add to Shopping List</strong> to compile its
              ingredients and quantities automatically.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onGoToCookbook}
                className="px-4 py-2 text-xs font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534]"
              >
                Browse Saved Recipes
              </button>
            </div>
          </div>
          <div className="md:col-span-5 min-h-[200px] bg-stone-100">
            <img
              src={MARKET_IMAGE_PATH}
              alt="Fresh lemons, shallots, thyme, and sourdough on linen"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      ) : groupedItems.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
          <p className="text-sm text-stone-600">No items match the current filter.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedItems.map(([category, categoryItems]) => (
            <div
              key={category}
              className="bg-white border border-stone-200 rounded-xl overflow-hidden"
            >
              <div className="px-5 py-3 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-700">
                  {category}
                </h2>
                <span className="font-mono tabular-nums text-xs text-stone-500">
                  {categoryItems.length}
                </span>
              </div>

              <ul className="divide-y divide-stone-100">
                {categoryItems.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <li
                      key={item.id}
                      className={`px-5 py-3.5 flex items-center justify-between gap-4 transition-colors ${
                        item.purchased ? 'bg-stone-50/70' : 'hover:bg-stone-50/40'
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex-1 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            placeholder="Qty"
                            className="w-20 px-2.5 py-1 text-xs font-mono border border-stone-300 rounded"
                          />
                          <input
                            type="text"
                            value={editUnit}
                            onChange={(e) => setEditUnit(e.target.value)}
                            placeholder="Unit"
                            className="w-24 px-2.5 py-1 text-xs border border-stone-300 rounded"
                          />
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Item"
                            className="flex-1 min-w-[140px] px-2.5 py-1 text-xs border border-stone-300 rounded"
                          />
                          <button
                            type="button"
                            onClick={() => void saveEdit(item)}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-[#14532D] rounded"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1 text-stone-400 hover:text-stone-700"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <label className="flex items-start gap-3.5 flex-1 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={item.purchased}
                              onChange={(e) =>
                                void onTogglePurchased(item.id, e.target.checked)
                              }
                              className="mt-0.5 h-4 w-4 rounded border-stone-300 text-[#14532D] focus:ring-[#14532D]"
                            />
                            <div className="space-y-0.5">
                              <div
                                className={`text-sm ${
                                  item.purchased
                                    ? 'line-through text-stone-400'
                                    : 'text-stone-900'
                                }`}
                              >
                                {(item.quantity || item.unit) && (
                                  <span className="font-mono tabular-nums font-medium mr-1.5">
                                    {[item.quantity, item.unit].filter(Boolean).join(' ')}
                                  </span>
                                )}
                                <span className="font-medium">{item.item}</span>
                                {item.notes && (
                                  <span className="text-stone-500">, {item.notes}</span>
                                )}
                              </div>
                              <p className="text-[11px] text-stone-500">
                                {item.purchased ? 'Purchased' : 'To buy'}
                                {item.recipeTitle ? ` · From ${item.recipeTitle}` : ''}
                              </p>
                            </div>
                          </label>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              aria-label={`Edit ${item.item}`}
                              className="p-1.5 text-stone-400 hover:text-stone-800 rounded"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDeleteItem(item.id)}
                              aria-label={`Remove ${item.item}`}
                              className="p-1.5 text-stone-400 hover:text-red-700 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
