import React from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 80,
  height = 24,
  color = '#3D5A8A',
  className = '',
}) => {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padding = 2;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;

  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * graphWidth;
    const y = height - padding - ((val - min) / range) * graphHeight;
    return `${x},${y}`;
  });

  const pathString = `M ${points.join(' L ')}`;

  return (
    <svg
      width={width}
      height={height}
      className={`inline-block shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path
        d={pathString}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

