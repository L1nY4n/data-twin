import { describe, expect, test } from 'bun:test'

import { extractDigitalTwinMetadata, hasDigitalTwinMetadata } from './model-metadata'

describe('digital twin model metadata parser', () => {
  test('extracts component semantics from rv_extras style metadata', () => {
    const metadata = extractDigitalTwinMetadata({
      userData: {
        rv_extras: {
          capabilities: ['selectable', 'controllable'],
          components: [
            {
              id: 'pump-a',
              name: 'Pump A',
              type: 'pump',
              capabilities: ['rotating', 'alarm-bearing'],
              signals: [
                {
                  id: 'pump-a-speed',
                  name: 'Speed',
                  path: 'PLC/PumpA/Speed',
                  unit: 'rpm',
                  direction: 'input',
                  value: 1200,
                },
              ],
            },
          ],
        },
      },
    })

    expect(metadata.capabilities).toEqual(['selectable', 'controllable'])
    expect(metadata.components[0]?.name).toBe('Pump A')
    expect(metadata.components[0]?.capabilities).toContain('rotating')
    expect(metadata.signals[0]?.path).toBe('PLC/PumpA/Speed')
    expect(metadata.signals[0]?.unit).toBe('rpm')
  })

  test('extracts realvirtual-like signals documents and maintenance hints', () => {
    const metadata = extractDigitalTwinMetadata({
      metadata: {
        realvirtual: {
          signals: [
            { name: 'ValveOpen', address: 'PLC/Valve/Open', writable: true },
            'Line1/Heartbeat',
          ],
          documents: [
            { title: 'Valve Manual', href: '/docs/valve-manual.pdf' },
            { label: 'P&ID', url: '/docs/pid.svg', kind: 'diagram' },
          ],
          maintenance: [
            {
              title: 'Quarterly actuator inspection',
              dueAt: '2026-05-01',
              priority: 'high',
            },
          ],
        },
      },
    })

    expect(metadata.signals.map((signal) => signal.name)).toEqual(['ValveOpen', 'Line1/Heartbeat'])
    expect(metadata.signals[0]?.direction).toBe('output')
    expect(metadata.documents.map((document) => document.kind)).toEqual(['pdf', 'diagram'])
    expect(metadata.maintenance[0]?.priority).toBe('high')
    expect(hasDigitalTwinMetadata({ metadata: { realvirtual: { documents: ['/docs/a.pdf'] } } })).toBe(true)
  })

  test('walks child node userData and deduplicates merged bindings', () => {
    const metadata = extractDigitalTwinMetadata({
      userData: {
        digitalTwin: {
          signals: [{ id: 'temp', name: 'Temperature', path: 'Line/Temp' }],
        },
      },
      children: [
        {
          userData: {
            realvirtual: {
              signals: [{ id: 'temp', name: 'Temperature', path: 'Line/Temp' }],
              manuals: ['/docs/line-startup.pdf'],
            },
          },
        },
      ],
    })

    expect(metadata.signals).toHaveLength(1)
    expect(metadata.documents[0]?.title).toBe('line-startup.pdf')
  })
})
