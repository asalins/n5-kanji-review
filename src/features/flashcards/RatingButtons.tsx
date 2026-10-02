import { REVIEW_RATINGS, type ReviewRating } from '../../types/entities';
import { SECONDARY_BUTTON } from '../../components/styles';
import { RATING_INFO } from './strings';

interface RatingButtonsProps {
  /** Reports the user's intent only. What a rating does is decided by the review layer. */
  readonly onRate: (rating: ReviewRating) => void;
  readonly disabled?: boolean;
}

export function RatingButtons({ onRate, disabled = false }: RatingButtonsProps) {
  return (
    <div role="group" aria-label="How well did you remember?" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {REVIEW_RATINGS.map((rating, index) => (
        <button
          key={rating}
          type="button"
          disabled={disabled}
          onClick={() => onRate(rating)}
          aria-keyshortcuts={String(index + 1)}
          className={`${SECONDARY_BUTTON} flex min-h-16 flex-col items-center justify-center`}
        >
          <span className="font-semibold">{RATING_INFO[rating].label}</span>
          <span className="text-xs text-stone-500 dark:text-neutral-400">{RATING_INFO[rating].hint}</span>
        </button>
      ))}
    </div>
  );
}
