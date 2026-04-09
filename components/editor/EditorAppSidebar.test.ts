import { describe, expect, test } from 'bun:test'
import { buildEditorSceneTree, isPointInsideZoneBoundary } from './EditorAppSidebar'

describe('editor app sidebar tree helpers', () => {
  test('detects xz containment inside zone boundaries', () => {
    expect(
      isPointInsideZoneBoundary(
        { x: 0, y: 0, z: 0 },
        [
          { x: -2, y: 0, z: -2 },
          { x: 2, y: 0, z: -2 },
          { x: 2, y: 0, z: 2 },
          { x: -2, y: 0, z: 2 },
        ]
      )
    ).toBe(true)

    expect(
      isPointInsideZoneBoundary(
        { x: 4, y: 0, z: 0 },
        [
          { x: -2, y: 0, z: -2 },
          { x: 2, y: 0, z: -2 },
          { x: 2, y: 0, z: 2 },
          { x: -2, y: 0, z: 2 },
        ]
      )
    ).toBe(false)
  })

  test('groups assets and entities beneath matching zones and keeps an unassigned root bucket', () => {
    const sections = buildEditorSceneTree(
      [
        {
          id: 'zone-workshop-01',
          type: 'zone',
          name: '总装作业区',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
          boundary: [
            { x: -5, y: 0, z: -5 },
            { x: 5, y: 0, z: -5 },
            { x: 5, y: 0, z: 5 },
            { x: -5, y: 0, z: 5 },
          ],
          zoneType: 'work',
          color: '#22c55e',
          accessRules: [],
          capacity: 8,
          currentOccupancy: 2,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      [
        {
          id: 'asset-inside',
          name: '罐体',
          assetKind: 'vertical-tank',
          variant: 'fixed-roof',
          position: { x: 1, y: 0, z: 1 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          visible: true,
          metadata: {},
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'asset-outside',
          name: '管廊',
          assetKind: 'pipe-rack',
          variant: 'west-header',
          position: { x: 12, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          visible: true,
          metadata: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      [
        {
          id: 'person-inside',
          type: 'person',
          name: '巡检员 A',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
          role: '操作员',
          department: '生产部',
          schedule: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ]
    )

    expect(sections.map((section) => section.id)).toEqual(['zone-workshop-01', 'scene-root'])
    expect(sections[0].assetCount).toBe(1)
    expect(sections[0].entityCount).toBe(1)
    expect(sections[1].assetCount).toBe(1)
    expect(sections[1].entityCount).toBe(0)
  })
})
