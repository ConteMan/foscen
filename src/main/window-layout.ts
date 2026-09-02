import {
  MAX_VISIBLE_ROWS,
  MAX_VISIBLE_ROWS_COMPACT,
  type ControlPresentation,
} from '../shared/ui-state.js'

export type WindowPresentationMode = 'frame' | 'minimal'

export const DEFAULT_WINDOW_PRESENTATION_MODE: WindowPresentationMode = 'frame'
export const WINDOW_FRAME_INSET = 10
export const WINDOW_SCENE_CORNER_RADIUS = 8
/** 风格乙面板圆角。必须打在 WebContentsView 上，仅 CSS 无法裁切原生 View。 */
export const CONTROL_CORNER_RADIUS = 12
export const CONTROL_PANEL_COLOR = '#1C1C1E'

const COMPACT_WIDTH_BREAKPOINT = 520
const COMPACT_HEIGHT_BREAKPOINT = 400

interface ViewBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ControlLayoutOptions {
  readonly presentation: ControlPresentation
  readonly rowCount: number
}

export interface WindowViewLayout {
  readonly windowChrome: ViewBounds
  readonly windowChromeVisible: boolean
  readonly scene: ViewBounds
  readonly sceneBorderRadius: number
  readonly control: ViewBounds
}

const DEFAULT_CONTROL_OPTIONS: ControlLayoutOptions = {
  presentation: 'omnibar',
  rowCount: 0,
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 依据契约第 2 节，`W < 520` 或 `H < 400` 时行数上限从 6 降到 4。 */
export function maxVisibleRowsFor(width: number, height: number): number {
  return width < COMPACT_WIDTH_BREAKPOINT || height < COMPACT_HEIGHT_BREAKPOINT
    ? MAX_VISIBLE_ROWS_COMPACT
    : MAX_VISIBLE_ROWS
}

/** 不信任 renderer 传来的 rowCount：非有限数视为 0，其余钳制到 `[0, maxRows]` 的整数。 */
export function clampRowCount(rowCount: number, maxRows: number): number {
  if (!Number.isFinite(rowCount)) {
    return 0
  }
  return clampNumber(Math.trunc(rowCount), 0, maxRows)
}

export function calculateControlBounds(
  width: number,
  height: number,
  options: ControlLayoutOptions,
): ViewBounds {
  const contentWidth = Math.max(1, Math.floor(width))
  const contentHeight = Math.max(1, Math.floor(height))

  if (options.presentation === 'toast') {
    const toastWidth = Math.max(1, Math.min(420, contentWidth - 48))
    const toastY = clampNumber(Math.round(contentHeight * 0.14), 72, 140)
    return {
      x: Math.round((contentWidth - toastWidth) / 2),
      y: toastY,
      width: toastWidth,
      height: 58,
    }
  }

  if (options.presentation === 'surface') {
    const surfaceWidth = Math.max(1, Math.min(720, contentWidth - 48))
    const surfaceY = clampNumber(Math.round(contentHeight * 0.1), 56, 96)
    const surfaceHeight = Math.max(1, Math.min(420, contentHeight - surfaceY - 16))
    return {
      x: Math.round((contentWidth - surfaceWidth) / 2),
      y: surfaceY,
      width: surfaceWidth,
      height: surfaceHeight,
    }
  }

  const maxRows = maxVisibleRowsFor(contentWidth, contentHeight)
  const rowCount = clampRowCount(options.rowCount, maxRows)
  const omnibarWidth = Math.max(1, Math.min(640, contentWidth - 48))
  const omnibarY = clampNumber(Math.round(contentHeight * 0.14), 72, 140)
  const omnibarHeight = Math.max(1, 90 + rowCount * 40)
  return {
    x: Math.round((contentWidth - omnibarWidth) / 2),
    y: omnibarY,
    width: omnibarWidth,
    height: omnibarHeight,
  }
}

export function calculateWindowViewLayout(
  width: number,
  height: number,
  mode: WindowPresentationMode = DEFAULT_WINDOW_PRESENTATION_MODE,
  control: ControlLayoutOptions = DEFAULT_CONTROL_OPTIONS,
): WindowViewLayout {
  const contentWidth = Math.max(1, Math.floor(width))
  const contentHeight = Math.max(1, Math.floor(height))
  const maximumFrameInset = Math.max(
    0,
    Math.min(Math.floor((contentWidth - 1) / 2), Math.floor((contentHeight - 1) / 2)),
  )
  const frameInset = mode === 'frame' ? Math.min(WINDOW_FRAME_INSET, maximumFrameInset) : 0

  return {
    windowChrome: {
      x: 0,
      y: 0,
      width: contentWidth,
      height: contentHeight,
    },
    windowChromeVisible: mode === 'frame',
    scene: {
      x: frameInset,
      y: frameInset,
      width: Math.max(1, contentWidth - frameInset * 2),
      height: Math.max(1, contentHeight - frameInset * 2),
    },
    sceneBorderRadius: mode === 'frame' ? Math.min(WINDOW_SCENE_CORNER_RADIUS, frameInset) : 0,
    control: calculateControlBounds(contentWidth, contentHeight, control),
  }
}
