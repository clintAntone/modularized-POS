/**
 * Food expense detection — shared between ExpensesSection and QuickExpenseModal.
 * Keywords are loaded from system_config (food_expense_keywords).
 * These defaults are used when the config key is absent.
 */
export const DEFAULT_FOOD_KEYWORDS = [
  'FOOD', 'MERYENDA', 'SNACKS', 'PAGKAIN', 'MEAL', 'MEALS',
  'ULAM', 'KAIN', 'LUNCH', 'DINNER', 'BREAKFAST', 'ALMUSAL',
];

export const isFoodExpense = (name: string, keywords: string[]): boolean => {
  if (!name.trim() || keywords.length === 0) return false;
  const upper = name.trim().toUpperCase();
  return keywords.some(kw => upper.includes(kw.trim().toUpperCase()));
};
