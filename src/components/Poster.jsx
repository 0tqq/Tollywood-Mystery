import { useState } from "react";

// size: "thumb" (suggestions) | "card" (guess cards, fills its column) | "large" (result)
// Shows a placeholder when there is no poster or the image fails to load.
export default function Poster({ movie, size = "thumb" }) {
  const [broken, setBroken] = useState(false);
  if (movie.posterUrl && !broken) {
    return (
      <img
        className={`poster ${size}`}
        src={movie.posterUrl}
        alt={`${movie.title} poster`}
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return <div className={`poster placeholder ${size}`}>No poster</div>;
}
