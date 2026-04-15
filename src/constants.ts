/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GradeInfo } from './types';

export const WORD_TARGET = 350;
export const MAX_MARKS = 30;

export function getGradeInfo(marks: number): GradeInfo {
  if (marks >= 25) return { text: 'Cemerlang (TP 6) 🌟', color: '#10b981' }; 
  if (marks >= 20) return { text: 'Kepujian (TP 5) ✅', color: '#3b82f6' };   
  if (marks >= 15) return { text: 'Baik (TP 4) 📝', color: '#8b5cf6' };       
  if (marks >= 11) return { text: 'Memuaskan (TP 3) 📊', color: '#f59e0b' };  
  if (marks >= 6)  return { text: 'Penguasaan Minimum (TP 2) ⚠️', color: '#f97316' }; 
  return { text: 'TPTPM (TP 1) ❌', color: '#ef4444' };                   
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
