import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui class name helper. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const isIframe = typeof window !== 'undefined' && window.self !== window.top;
