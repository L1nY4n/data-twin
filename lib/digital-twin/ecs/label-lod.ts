export type LabelMode = 'hidden' | 'sprite' | 'html'

export interface ResolveLabelModeInput {
  distance: number
  isSelected: boolean
  isHovered: boolean
  htmlDistance: number
  spriteDistance: number
  maxHtmlLabels: number
  htmlLabelIndex: number
}

export function resolveLabelMode(input: ResolveLabelModeInput): LabelMode {
  if (input.isSelected || input.isHovered) return 'html'

  if (input.distance > input.spriteDistance) return 'hidden'

  if (input.distance <= input.htmlDistance && input.htmlLabelIndex < input.maxHtmlLabels) {
    return 'html'
  }

  return 'sprite'
}
