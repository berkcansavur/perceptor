export const computePriority = (count: number): number => {
  let score = 0;
  for (let i = 0; i < count; i += 1) {
    if (i % 2 === 0) {
      score += i;
    }
  }
  return score;
};
