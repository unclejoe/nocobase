/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';

const ROWS = [260, 136, 372, 886, 2047, 1533, 1285, 216];
const CELLS: { x: number; y: number }[] = [];
ROWS.forEach((row, j) => {
  for (let i = 0; i < 11; i++) {
    if ((row >> (10 - i)) & 1) {
      CELLS.push({ x: i * 50, y: j * 50 });
    }
  }
});

/**
 * Pixel space-invader brand mark, drawn as inline SVG with the same yellow -> violet glass ramp
 * as the sign-in artwork and the favicon.
 */
export const InvaderLogo: React.FC<{ height?: number }> = ({ height = 28 }) => (
  <svg
    width={(height * 11) / 8}
    height={height}
    viewBox="0 0 550 400"
    fill="none"
    aria-hidden
    data-testid="invader-logo"
  >
    <defs>
      <linearGradient id="invader-logo-gradient" x1="275" y1="0" x2="275" y2="400" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#f0f27a" />
        <stop offset="0.38" stopColor="#f6a95e" />
        <stop offset="0.68" stopColor="#e95fd0" />
        <stop offset="1" stopColor="#a43df2" />
      </linearGradient>
    </defs>
    {CELLS.map((cell, index) => (
      <rect
        key={index}
        x={cell.x + 4}
        y={cell.y + 4}
        width={42}
        height={42}
        rx={13}
        fill="url(#invader-logo-gradient)"
      />
    ))}
  </svg>
);
