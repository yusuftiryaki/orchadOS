// The orchadOS mark: a planting grid seen from above, three rows of trees;
// one tree is picked out in the ripe-hull colour, as the portal picks out
// the tree you open.
export function LogoMark({ size = 28 }: { size?: number }) {
  const dots = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const picked = row === 1 && col === 2;
      dots.push(
        <circle
          key={`${row}-${col}`}
          cx={9 + col * 7}
          cy={9 + row * 7}
          r={picked ? 3.3 : 2.6}
          fill={picked ? "#e48aa4" : "#b5cf6b"}
        />,
      );
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <rect width="32" height="32" rx="7" fill="#3b6a1e" />
      {dots}
    </svg>
  );
}
