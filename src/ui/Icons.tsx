// Thin-line icons (no emoji). 16px grid, stroke = currentColor.
const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true } as const;

export const PlayIcon = () => (
  <svg {...base}>
    <path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" />
  </svg>
);
export const PauseIcon = () => (
  <svg {...base}>
    <path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth={2} />
  </svg>
);
export const PrevIcon = () => (
  <svg {...base}>
    <path d="M4 3.5v9M12 3.5 6 8l6 4.5z" />
  </svg>
);
export const NextIcon = () => (
  <svg {...base}>
    <path d="M12 3.5v9M4 3.5 10 8l-6 4.5z" />
  </svg>
);
export const RestartIcon = () => (
  <svg {...base}>
    <path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3M3.5 2.5v3h3" />
  </svg>
);
