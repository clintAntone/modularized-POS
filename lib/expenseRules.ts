/**
 * Receipt-required expense rules — shared between ExpensesSection and QuickExpenseModal.
 *
 * Rules are loaded from system_config key: `receipt_required_rules`
 * Format: [{ label, keywords, message? }, ...]
 *
 * These defaults are used when the config key is absent.
 * To add a new receipt-required category in the future, add an entry to
 * system_config — no code changes needed.
 */

export interface ReceiptRequiredRule {
  label: string;       // e.g. "Food", "Boosting" — shown in warning
  keywords: string[];  // matched against the expense name (case-insensitive, substring)
  message?: string;    // optional custom warning; falls back to generic if omitted
}

export const DEFAULT_RECEIPT_RULES: ReceiptRequiredRule[] = [
  {
    label: 'Food',
    keywords: [
      'FOOD', 'MERYENDA', 'SNACKS', 'PAGKAIN', 'MEAL', 'MEALS',
      'ULAM', 'KAIN', 'LUNCH', 'DINNER', 'BREAKFAST', 'ALMUSAL',
    ],
    message: 'Attach Facebook attendance post screenshot as proof',
  },
  {
    label: 'Boosting',
    keywords: [
      'BOOST', 'BOOSTING', 'FACEBOOK BOOST', 'FACEBOOK BOOSTING',
      'FB BOOST', 'FB BOOSTING', 'MARKETING', 'BOOSTING ADS', 'SOCIAL MEDIA BOOST',
    ],
    message: 'Attach screenshot of the boosted post as proof',
  },
];

/**
 * Returns the first matching rule if the expense name requires a receipt, or null.
 */
export const getReceiptRule = (name: string, rules: ReceiptRequiredRule[]): ReceiptRequiredRule | null => {
  if (!name.trim() || rules.length === 0) return null;
  const upper = name.trim().toUpperCase();
  return rules.find(rule =>
    rule.keywords.some(kw => upper.includes(kw.trim().toUpperCase()))
  ) ?? null;
};
