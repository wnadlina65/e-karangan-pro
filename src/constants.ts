/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GradeInfo } from './types';

export const WORD_TARGET_A = 210;
export const WORD_TARGET_B_MIN = 350;
export const WORD_TARGET_B_MAX = 510;

export const MAX_MARKS_A = 30;
export const MAX_MARKS_B = 70;

export function getGradeInfo(marks: number, section: 'A' | 'B' = 'B'): GradeInfo {
  const max = section === 'A' ? MAX_MARKS_A : MAX_MARKS_B;
  const percentage = (marks / max) * 100;

  if (percentage >= 87) return { text: 'Cemerlang 🌟', color: '#10b981', stars: 6 }; 
  if (percentage >= 70) return { text: 'Sangat Baik ✅', color: '#3b82f6', stars: 5 };   
  if (percentage >= 51) return { text: 'Baik 📝', color: '#8b5cf6', stars: 4 };       
  if (percentage >= 33) return { text: 'Memuaskan 📊', color: '#f59e0b', stars: 3 };  
  if (percentage >= 15) return { text: 'Kurang Memuaskan ⚠️', color: '#f97316', stars: 2 }; 
  return { text: 'Sangat Lemah ❌', color: '#ef4444', stars: 1 };                   
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ms-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
