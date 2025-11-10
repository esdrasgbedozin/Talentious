/**
 * Utility functions for Talentious
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date to French locale
 * @param date - Date object or ISO string
 * @returns Formatted date string in French
 * @throws Error if date is invalid
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Check if date is valid
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }
  
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

/**
 * Truncate text with ellipsis
 * @param text - Text to truncate
 * @param length - Maximum length (must be positive)
 * @returns Truncated text with ellipsis if needed
 */
export function truncate(text: string, length: number): string {
  if (length < 0) {
    throw new Error('Length must be a positive number');
  }
  
  if (text.length <= length) return text;
  return text.slice(0, length) + '...';
}
