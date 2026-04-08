'use client'

import { animate, spring, stagger } from 'animejs'
import { createScope } from 'animejs/scope'
import { useEffect, useEffectEvent, useRef, type RefObject } from 'react'

type HTMLElementRef = RefObject<HTMLElement | null>
type PanelDirection = 'left' | 'right'

const CHROME_CONTROL_SELECTOR =
  '.editor-control, .editor-menu-button, .editor-tab-trigger, .editor-floating-toggle'
const PANEL_EXPAND_DURATION = 520
const PANEL_COLLAPSE_DURATION = 280

type UseEditorChromeMotionParams = {
  rootRef: HTMLElementRef
  leftPanelRef: HTMLElementRef
  toolbarRef: HTMLElementRef
  rightPanelRef: HTMLElementRef
  dockRef: HTMLElementRef
  resourcesPanelOpen: boolean
  inspectorCollapsed: boolean
}

function getPanelShift(direction: PanelDirection, expanded: boolean) {
  const distance = expanded ? 18 : 10
  return direction === 'left' ? -distance : distance
}

export function useEditorChromeMotion({
  rootRef,
  leftPanelRef,
  toolbarRef,
  rightPanelRef,
  dockRef,
  resourcesPanelOpen,
  inspectorCollapsed,
}: UseEditorChromeMotionParams) {
  const hasMountedRef = useRef(false)
  const motionEnabledRef = useRef(true)

  const animateControlTap = useEffectEvent((target: HTMLElement) => {
    animate(target, {
      scale: [1, 0.975, 1],
      duration: 320,
      ease: spring({ bounce: 0.35, duration: 320 }),
    })
  })

  const animatePanelState = useEffectEvent(
    (element: HTMLElement | null, expanded: boolean, direction: PanelDirection) => {
      if (!element || !motionEnabledRef.current) {
        return
      }

      const shift = getPanelShift(direction, expanded)
      const duration = expanded ? PANEL_EXPAND_DURATION : PANEL_COLLAPSE_DURATION

      animate(element, {
        opacity: expanded ? [0.76, 1] : [1, 0.68],
        scale: expanded ? [0.984, 1] : [1, 0.982],
        translateX: expanded ? [shift, 0] : [0, shift],
        duration,
        ease: spring({
          bounce: expanded ? 0.26 : 0.16,
          duration,
        }),
      })
    }
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }

    const scope = createScope({
      root: rootRef,
      mediaQueries: {
        reduceMotion: '(prefers-reduced-motion: reduce)',
      },
    }).add((self) => {
      if (!self) {
        return
      }

      motionEnabledRef.current = !self.matches.reduceMotion

      if (!motionEnabledRef.current) {
        return
      }

      const chromeTargets = [
        leftPanelRef.current,
        toolbarRef.current,
        rightPanelRef.current,
        dockRef.current,
      ].filter((target): target is HTMLElement => Boolean(target))

      if (chromeTargets.length > 0) {
        animate(chromeTargets, {
          opacity: [0, 1],
          scale: [0.986, 1],
          translateX: (_target: unknown, index: number) => {
            if (index === 0) return [-24, 0]
            if (index === 2) return [24, 0]
            return [0, 0]
          },
          translateY: (_target: unknown, index: number) => {
            if (index === 1) return [-18, 0]
            if (index === 3) return [18, 0]
            return [0, 0]
          },
          delay: stagger(58, { start: 90 }),
          duration: 640,
          ease: spring({ bounce: 0.22, duration: 640 }),
        })
      }

      const handlePointerDown = (event: PointerEvent) => {
        const eventTarget = event.target
        if (!(eventTarget instanceof Element)) {
          return
        }

        const chromeControl = eventTarget.closest<HTMLElement>(
          CHROME_CONTROL_SELECTOR
        )

        if (!chromeControl || chromeControl.matches(':disabled,[aria-disabled="true"]')) {
          return
        }

        animateControlTap(chromeControl)
      }

      root.addEventListener('pointerdown', handlePointerDown, { passive: true })

      return () => {
        root.removeEventListener('pointerdown', handlePointerDown)
      }
    })

    return () => {
      scope.revert()
      motionEnabledRef.current = true
    }
  }, [dockRef, leftPanelRef, rightPanelRef, rootRef, toolbarRef])

  useEffect(() => {
    if (!hasMountedRef.current) {
      return
    }

    animatePanelState(leftPanelRef.current, resourcesPanelOpen, 'left')
  }, [leftPanelRef, resourcesPanelOpen])

  useEffect(() => {
    if (!hasMountedRef.current) {
      return
    }

    animatePanelState(rightPanelRef.current, !inspectorCollapsed, 'right')
  }, [inspectorCollapsed, rightPanelRef])

  useEffect(() => {
    hasMountedRef.current = true
  }, [])
}
