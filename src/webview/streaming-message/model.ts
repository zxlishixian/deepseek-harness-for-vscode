const MINIMUM_STEP = 3
const TARGET_FRAMES = 8

/** Advances a stream enough to stay smooth without falling far behind large chunks. */
export function nextStreamText(rendered: string, target: string): string {
  if (rendered === target) return rendered
  if (!target.startsWith(rendered)) return target
  const remaining = target.length - rendered.length
  const step = Math.max(MINIMUM_STEP, Math.ceil(remaining / TARGET_FRAMES))
  return target.slice(0, Math.min(target.length, rendered.length + step))
}
