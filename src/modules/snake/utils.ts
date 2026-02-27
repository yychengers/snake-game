import { MAX_LEVEL } from './constants';
import type { Point } from './types';

/** Returns whether the target point exists in a list of points. */
export function containsPoint(points: Point[], target: Point): boolean {
  return points.some((point) => point.x === target.x && point.y === target.y);
}

/** Converts a point to a map key string. */
export function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}

/** Clamps level to [1, MAX_LEVEL] and strips decimals. */
export function normalizeLevel(level: number): number {
  return Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
}
