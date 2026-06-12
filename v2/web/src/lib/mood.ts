export type Mood = 'neutral' | 'student' | 'asha';

/**
 * The ambient background tints with who is "holding the room": faint warm
 * while the student speaks, faint indigo while Asha speaks. Set as a data
 * attribute so it's pure CSS from here on.
 */
export function setMood(mood: Mood): void {
  document.documentElement.dataset.mood = mood;
}
