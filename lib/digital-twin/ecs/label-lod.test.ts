import { describe, expect, test } from 'bun:test'
import { resolveLabelMode } from './label-lod'

describe('resolveLabelMode', () => {
  test('always keeps selected entity as html', () => {
    const mode = resolveLabelMode({
      distance: 120,
      isSelected: true,
      isHovered: false,
      htmlDistance: 16,
      spriteDistance: 42,
      maxHtmlLabels: 40,
      htmlLabelIndex: 500,
    })

    expect(mode).toBe('html')
  })

  test('uses html for nearby entities within html distance and label cap', () => {
    const mode = resolveLabelMode({
      distance: 10,
      isSelected: false,
      isHovered: false,
      htmlDistance: 16,
      spriteDistance: 42,
      maxHtmlLabels: 40,
      htmlLabelIndex: 5,
    })

    expect(mode).toBe('html')
  })

  test('degrades to sprite when html cap is reached', () => {
    const mode = resolveLabelMode({
      distance: 10,
      isSelected: false,
      isHovered: false,
      htmlDistance: 16,
      spriteDistance: 42,
      maxHtmlLabels: 4,
      htmlLabelIndex: 9,
    })

    expect(mode).toBe('sprite')
  })

  test('hides distant labels beyond sprite distance', () => {
    const mode = resolveLabelMode({
      distance: 90,
      isSelected: false,
      isHovered: false,
      htmlDistance: 16,
      spriteDistance: 42,
      maxHtmlLabels: 40,
      htmlLabelIndex: 0,
    })

    expect(mode).toBe('hidden')
  })
})
