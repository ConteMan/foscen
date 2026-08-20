export type WindowPresentationMode = 'frame' | 'minimal'

export const DEFAULT_WINDOW_PRESENTATION_MODE: WindowPresentationMode = 'frame'
export const WINDOW_FRAME_INSET = 10
export const WINDOW_SCENE_CORNER_RADIUS = 8

const CONTROL_HEIGHT = 530
const CONTROL_SIDE_INSET = 52
const CONTROL_GAP = 8
const CONTROL_TOP_INSET = 44

interface ViewBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface WindowViewLayout {
  readonly windowChrome: ViewBounds
  readonly windowChromeVisible: boolean
  readonly scene: ViewBounds
  readonly sceneBorderRadius: number
  readonly control: ViewBounds
}

export function calculateWindowViewLayout(
  width: number,
  height: number,
  mode: WindowPresentationMode = DEFAULT_WINDOW_PRESENTATION_MODE,
): WindowViewLayout {
  const contentWidth = Math.max(1, Math.floor(width))
  const contentHeight = Math.max(1, Math.floor(height))
  const maximumFrameInset = Math.max(
    0,
    Math.min(Math.floor((contentWidth - 1) / 2), Math.floor((contentHeight - 1) / 2)),
  )
  const frameInset = mode === 'frame' ? Math.min(WINDOW_FRAME_INSET, maximumFrameInset) : 0
  const requestedControlInset = Math.min(
    CONTROL_SIDE_INSET,
    Math.max(CONTROL_GAP, Math.floor(contentWidth * 0.05)),
  )
  const controlInset = Math.min(
    requestedControlInset,
    Math.max(0, Math.floor((contentWidth - 1) / 2)),
  )
  const controlTop = Math.min(CONTROL_TOP_INSET, Math.max(0, contentHeight - 1))

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
    control: {
      x: controlInset,
      y: controlTop,
      width: Math.max(1, contentWidth - controlInset * 2),
      height: Math.max(1, Math.min(CONTROL_HEIGHT, contentHeight - controlTop - CONTROL_GAP)),
    },
  }
}
