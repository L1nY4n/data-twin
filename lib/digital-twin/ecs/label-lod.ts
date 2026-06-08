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

export interface ResolveLabelModeFromDistanceSquaredInput {
  distanceSquared: number
  isSelected: boolean
  isHovered: boolean
  htmlDistanceSquared: number
  spriteDistanceSquared: number
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

export function resolveLabelModeFromDistanceSquared(
  input: ResolveLabelModeFromDistanceSquaredInput
): LabelMode {
  if (input.isSelected || input.isHovered) return 'html'

  if (input.distanceSquared > input.spriteDistanceSquared) return 'hidden'

  if (
    input.distanceSquared <= input.htmlDistanceSquared &&
    input.htmlLabelIndex < input.maxHtmlLabels
  ) {
    return 'html'
  }

  return 'sprite'
}
