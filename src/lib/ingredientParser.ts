import type { RecipeIngredient, ShoppingCategory } from '../types/recipe';

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

export function parseQuantityNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let normalized = trimmed;
  for (const [sym, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (normalized.includes(sym)) {
      normalized = normalized.replace(sym, ` ${val}`).trim();
    }
  }

  // Handle mixed fraction like "1 1/2"
  const mixedMatch = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const num = Number(mixedMatch[2]);
    const den = Number(mixedMatch[3]);
    if (den !== 0) return whole + num / den;
  }

  // Handle simple fraction like "3/4"
  const fracMatch = normalized.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = Number(fracMatch[1]);
    const den = Number(fracMatch[2]);
    if (den !== 0) return num / den;
  }

  // Handle mixed decimal from unicode replacement like "1 0.5"
  const spaceNums = normalized.split(/\s+/).map(Number);
  if (spaceNums.length === 2 && spaceNums.every((n) => !Number.isNaN(n))) {
    return spaceNums[0] + spaceNums[1];
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function formatQuantityNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(Number(rounded.toFixed(2)));
}

export function scaleQuantityString(raw: string, factor: number): string {
  if (factor === 1 || !raw.trim()) return raw;

  // Handle range like "2-3" or "2 - 3"
  const rangeMatch = raw.trim().match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (rangeMatch) {
    const a = parseQuantityNumber(rangeMatch[1]);
    const b = parseQuantityNumber(rangeMatch[2]);
    if (a !== null && b !== null) {
      return `${formatQuantityNumber(a * factor)}-${formatQuantityNumber(b * factor)}`;
    }
  }

  const parsed = parseQuantityNumber(raw);
  if (parsed === null) return raw;
  return formatQuantityNumber(parsed * factor);
}

export function categorizeIngredient(itemName: string): ShoppingCategory {
  const lower = itemName.toLowerCase();

  if (
    /(tomato|onion|garlic|shallot|basil|parsley|cilantro|thyme|rosemary|lemon|lime|apple|banana|berry|berries|spinach|kale|lettuce|pepper|carrot|celery|potato|mushroom|avocado|zucchini|broccoli|ginger|scallion|chive|mint|herb|cucumber|corn|squash|cabbage|eggplant|jalapeno|chili)/.test(
      lower
    )
  ) {
    return 'Produce';
  }

  if (
    /(butter|milk|cream|cheese|parmesan|mozzarella|cheddar|ricotta|yogurt|egg|sour cream|mascarpone|feta|ghee|buttermilk)/.test(
      lower
    )
  ) {
    return 'Dairy & Eggs';
  }

  if (
    /(chicken|beef|pork|steak|bacon|sausage|turkey|lamb|salmon|shrimp|fish|tuna|cod|crab|scallop|anchovy|prosciutto|ham|duck)/.test(
      lower
    )
  ) {
    return 'Meat & Seafood';
  }

  if (
    /(flour|bread|sourdough|baguette|pasta|spaghetti|noodle|rice|quinoa|oat|tortilla|bun|brioche|panko|breadcrumb|cornmeal|couscous|gnocchi|ramen|udon)/.test(
      lower
    )
  ) {
    return 'Bakery & Grains';
  }

  if (
    /(oil|olive oil|vinegar|salt|peppercorn|black pepper|paprika|cumin|oregano|cinnamon|nutmeg|chili flake|red pepper|turmeric|curry|soy sauce|sesame oil|vanilla|extract|garlic powder|onion powder|cayenne|bay leaf)/.test(
      lower
    )
  ) {
    return 'Spices & Oils';
  }

  if (
    /(sugar|honey|maple|broth|stock|tomato paste|crushed tomato|beans|chickpea|lentil|coconut milk|mustard|mayo|ketchup|yeast|baking powder|baking soda|chocolate|cocoa|nut|almond|walnut|pecan|wine|capers|olive)/.test(
      lower
    )
  ) {
    return 'Pantry';
  }

  return 'Other';
}

export function normalizeItemKey(item: string, unit: string): string {
  return `${item.trim().toLowerCase()}__${unit.trim().toLowerCase()}`;
}

export function combineQuantities(existingQty: string, addedQty: string): string {
  const a = parseQuantityNumber(existingQty);
  const b = parseQuantityNumber(addedQty);
  if (a !== null && b !== null) {
    return formatQuantityNumber(a + b);
  }
  if (!existingQty.trim()) return addedQty.trim();
  if (!addedQty.trim()) return existingQty.trim();
  if (existingQty.trim() === addedQty.trim()) return existingQty.trim();
  return `${existingQty.trim()} + ${addedQty.trim()}`;
}

export function parseIngredientLine(line: string, index: number): RecipeIngredient {
  const clean = line.trim();
  const match = clean.match(
    /^([\d¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞./\s-]+)?\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|cloves?|cans?|pinch|pinches|bunch|bunches|slices?|pieces?|sprigs?)?\s*(.+)$/i
  );

  if (!match) {
    return {
      id: `ing-${Date.now()}-${index}`,
      quantity: '',
      unit: '',
      item: clean,
      notes: '',
    };
  }

  const quantity = (match[1] ?? '').trim();
  const unit = (match[2] ?? '').trim();
  const rest = (match[3] ?? clean).trim();

  const [itemPart, ...noteParts] = rest.split(',');
  return {
    id: `ing-${Date.now()}-${index}`,
    quantity,
    unit,
    item: itemPart.trim() || clean,
    notes: noteParts.join(',').trim(),
  };
}
