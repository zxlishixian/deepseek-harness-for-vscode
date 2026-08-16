/** Three-dot activity indicator with a staggered Claude-style hop animation. */
export function createSequentialActivityDots(document: Document): HTMLElement {
  const indicator = document.createElement('span')
  indicator.className = 'streaming-indicator'
  indicator.setAttribute('aria-hidden', 'true')
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement('span')
    dot.className = 'streaming-indicator-dot'
    indicator.append(dot)
  }
  return indicator
}
