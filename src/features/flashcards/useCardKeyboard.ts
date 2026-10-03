import { useEffect } from 'react';
import { REVIEW_RATINGS, type ReviewRating } from '../../types/entities';
import type { FlashcardPhase } from './Flashcard';

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT']);

interface CardKeyboardOptions {
  readonly enabled: boolean;
  readonly phase: FlashcardPhase;
  readonly onReveal: () => void;
  readonly onRate: (rating: ReviewRating) => void;
}

/**
 * Space/Enter reveals, 1-4 rate (AGAIN..EASY). Native button activation is left alone, so a focused
 * button never fires twice and there is no keyboard trap.
 */
export function useCardKeyboard({ enabled, phase, onReveal, onRate }: CardKeyboardOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target !== null && INTERACTIVE_TAGS.has(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (phase === 'front' && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        onReveal();
      } else if (phase === 'revealed') {
        const rating = REVIEW_RATINGS[Number(event.key) - 1];
        if (rating !== undefined) {
          event.preventDefault();
          onRate(rating);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled, phase, onReveal, onRate]);
}
