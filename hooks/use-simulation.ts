'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import {
  generateMockScene,
  simulateEntityMovement,
  simulateEquipmentStatus,
  generateId,
} from '@/lib/digital-twin/mock-data'
import type { EquipmentEntity, Alarm } from '@/lib/digital-twin/types'

interface UseSimulationOptions {
  autoStart?: boolean
  updateInterval?: number
}

export function useSimulation(options: UseSimulationOptions = {}) {
  const { autoStart = true, updateInterval = 100 } = options

  const isRunning = useRef(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const initialized = useRef(false)

  // 初始化场景数据
  const initializeScene = useCallback(() => {
    if (initialized.current) return

    const { persons, vehicles, equipment, zones } = generateMockScene()
    const { addEntity, setConnectionStatus } = useDigitalTwinStore.getState()

    // 添加所有实体
    zones.forEach(addEntity)
    persons.forEach(addEntity)
    vehicles.forEach(addEntity)
    equipment.forEach(addEntity)

    initialized.current = true
    setConnectionStatus(true, 'simulation://local')
  }, [])

  // 更新实体位置和状态
  const updateEntities = useCallback(() => {
    const now = Date.now()
    const { entities, updateEntity, addTrajectoryPoint, addAlarm } = useDigitalTwinStore.getState()

    entities.forEach((entity) => {
      if (entity.type === 'zone') return

      if (entity.type === 'person' || entity.type === 'vehicle') {
        // 模拟移动
        const { position, rotationY } = simulateEntityMovement(entity)

        updateEntity(entity.id, {
          position,
          rotation: {
            ...entity.rotation,
            y: rotationY,
          },
        })

        // 记录轨迹
        addTrajectoryPoint(entity.id, {
          position,
          timestamp: now,
        })
      }

      if (entity.type === 'equipment') {
        // 模拟设备状态变化
        const updates = simulateEquipmentStatus(entity as EquipmentEntity)
        const prevStatus = entity.status
        
        updateEntity(entity.id, updates)

        // 生成告警
        if (updates.status === 'warning' && prevStatus !== 'warning') {
          const alarm: Alarm = {
            id: generateId(),
            level: 'warning',
            message: `设备 ${entity.name} 温度过高`,
            timestamp: now,
            acknowledged: false,
          }
          addAlarm(alarm)
        }

        if (updates.status === 'error' && prevStatus !== 'error') {
          const alarm: Alarm = {
            id: generateId(),
            level: 'error',
            message: `设备 ${entity.name} 发生故障`,
            timestamp: now,
            acknowledged: false,
          }
          addAlarm(alarm)
        }
      }
    })
  }, [])

  // 启动模拟
  const start = useCallback(() => {
    if (isRunning.current) return

    initializeScene()
    isRunning.current = true

    intervalRef.current = setInterval(() => {
      updateEntities()
    }, updateInterval)
  }, [initializeScene, updateEntities, updateInterval])

  // 停止模拟
  const stop = useCallback(() => {
    isRunning.current = false
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // 重置场景
  const reset = useCallback(() => {
    stop()
    initialized.current = false
    useDigitalTwinStore.getState().reset()
    if (autoStart) {
      start()
    }
  }, [stop, autoStart, start])

  // 自动启动
  useEffect(() => {
    if (autoStart) {
      start()
    }

    return () => {
      stop()
    }
  }, [autoStart, start, stop])

  return {
    start,
    stop,
    reset,
    isRunning: isRunning.current,
  }
}
