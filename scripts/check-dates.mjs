#!/usr/bin/env node
// Flags .toISOString().split('T')[0] and .toISOString().slice(0,10) patterns
// that should use getManilaTodayStr() or toManilaDateStr() from lib/time.ts.

import { execSync } from 'child_process';

const raw = execSync(
  "grep -rn 'toISOString' components hooks lib --include='*.ts' --include='*.tsx' 2>/dev/null || true"
).toString();

const violations = raw
  .split('\n')
  .filter(line =>
    line.includes(".split('T')[0]") ||
    line.includes('.split("T")[0]') ||
    line.includes('.slice(0,10)')
  );

if (violations.length > 0) {
  console.error('❌ Raw UTC date-string pattern detected. Use getManilaTodayStr() or toManilaDateStr() instead:\n');
  violations.forEach(v => console.error('  ' + v));
  process.exit(1);
}

console.log('✓ No raw UTC date-string patterns found.');
