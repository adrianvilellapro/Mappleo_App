"use client";

import { useState } from "react";
import { Star } from "lucide-react";

export function InterestRating({ value }: { value: number }) {
  const [rating, setRating] = useState(value);
  const [hovered, setHovered] = useState(0);
  return (
    <div className="rating-picker" role="radiogroup" aria-label="Interés">
      <input type="hidden" name="interestRating" value={rating} />
      {[1, 2, 3, 4, 5].map((number) => (
        <button
          key={number}
          type="button"
          role="radio"
          aria-label={`${number} ${number === 1 ? "estrella" : "estrellas"}`}
          aria-checked={rating === number}
          className={number <= (hovered || rating) ? "rating-active" : ""}
          onMouseEnter={() => setHovered(number)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => setRating(number)}
        >
          <Star size={27} aria-hidden="true" />
        </button>
      ))}
      <span className="rating-value">{rating}/5</span>
    </div>
  );
}
