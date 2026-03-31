'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, User, Car, Cog, Map } from 'lucide-react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { generateId } from '@/lib/digital-twin/mock-data'
import type { EntityType } from '@/lib/digital-twin/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const ENTITY_TYPES: { value: EntityType; label: string; icon: typeof User }[] = [
  { value: 'person', label: '人员', icon: User },
  { value: 'vehicle', label: '车辆', icon: Car },
  { value: 'equipment', label: '设备', icon: Cog },
  { value: 'zone', label: '区域', icon: Map },
]

const baseSchema = z.object({
  name: z.string().min(1, '请输入名称'),
  posX: z.coerce.number(),
  posY: z.coerce.number(),
  posZ: z.coerce.number(),
})

const personSchema = baseSchema.extend({
  role: z.string().min(1, '请选择角色'),
  department: z.string().min(1, '请输入部门'),
})

const vehicleSchema = baseSchema.extend({
  plateNumber: z.string().min(1, '请输入车牌号'),
  vehicleType: z.enum(['car', 'truck', 'forklift', 'agv', 'other']),
})

const equipmentSchema = baseSchema.extend({
  modelId: z.string().optional(),
})

const zoneSchema = baseSchema.extend({
  zoneType: z.enum(['work', 'storage', 'passage', 'restricted', 'danger', 'custom']),
  width: z.coerce.number().min(1, '宽度必须大于0'),
  depth: z.coerce.number().min(1, '深度必须大于0'),
  color: z.string(),
})

export function EntityFormDialog() {
  const [open, setOpen] = useState(false)
  const [entityType, setEntityType] = useState<EntityType>('person')
  const addEntity = useDigitalTwinStore((state) => state.addEntity)

  const personForm = useForm({
    resolver: zodResolver(personSchema),
    defaultValues: {
      name: '',
      posX: 0,
      posY: 0,
      posZ: 0,
      role: '',
      department: '',
    },
  })

  const vehicleForm = useForm({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      name: '',
      posX: 0,
      posY: 0,
      posZ: 0,
      plateNumber: '',
      vehicleType: 'car' as const,
    },
  })

  const equipmentForm = useForm({
    resolver: zodResolver(equipmentSchema),
    defaultValues: {
      name: '',
      posX: 0,
      posY: 0,
      posZ: 0,
      modelId: '',
    },
  })

  const zoneForm = useForm({
    resolver: zodResolver(zoneSchema),
    defaultValues: {
      name: '',
      posX: 0,
      posY: 0,
      posZ: 0,
      zoneType: 'work' as const,
      width: 10,
      depth: 10,
      color: '#22c55e',
    },
  })

  const handleSubmit = () => {
    const now = Date.now()
    const id = generateId()

    switch (entityType) {
      case 'person':
        personForm.handleSubmit((data) => {
          addEntity({
            id,
            type: 'person',
            name: data.name,
            position: { x: data.posX, y: data.posY, z: data.posZ },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            status: 'active',
            visible: true,
            metadata: {},
            createdAt: now,
            updatedAt: now,
            role: data.role,
            department: data.department,
            schedule: [],
          })
          personForm.reset()
          setOpen(false)
        })()
        break

      case 'vehicle':
        vehicleForm.handleSubmit((data) => {
          addEntity({
            id,
            type: 'vehicle',
            name: data.name,
            position: { x: data.posX, y: data.posY, z: data.posZ },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            status: 'active',
            visible: true,
            metadata: {},
            createdAt: now,
            updatedAt: now,
            plateNumber: data.plateNumber,
            vehicleType: data.vehicleType,
            speed: 0,
            heading: 0,
          })
          vehicleForm.reset()
          setOpen(false)
        })()
        break

      case 'equipment':
        equipmentForm.handleSubmit((data) => {
          addEntity({
            id,
            type: 'equipment',
            name: data.name,
            position: { x: data.posX, y: data.posY, z: data.posZ },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            status: 'active',
            visible: true,
            metadata: {},
            createdAt: now,
            updatedAt: now,
            modelId: data.modelId,
            parameters: {},
            alarms: [],
          })
          equipmentForm.reset()
          setOpen(false)
        })()
        break

      case 'zone':
        zoneForm.handleSubmit((data) => {
          const halfWidth = data.width / 2
          const halfDepth = data.depth / 2
          const cx = data.posX
          const cz = data.posZ

          addEntity({
            id,
            type: 'zone',
            name: data.name,
            position: { x: cx, y: 0, z: cz },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            status: 'active',
            visible: true,
            metadata: {},
            createdAt: now,
            updatedAt: now,
            boundary: [
              { x: cx - halfWidth, y: 0, z: cz - halfDepth },
              { x: cx + halfWidth, y: 0, z: cz - halfDepth },
              { x: cx + halfWidth, y: 0, z: cz + halfDepth },
              { x: cx - halfWidth, y: 0, z: cz + halfDepth },
            ],
            zoneType: data.zoneType,
            color: data.color,
            accessRules: [],
          })
          zoneForm.reset()
          setOpen(false)
        })()
        break
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          添加实体
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>添加新实体</DialogTitle>
          <DialogDescription>
            创建一个新的人员、车辆、设备或区域
          </DialogDescription>
        </DialogHeader>

        <Tabs value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
          <TabsList className="grid w-full grid-cols-4">
            {ENTITY_TYPES.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1 text-xs">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* 人员表单 */}
          <TabsContent value="person" className="mt-4">
            <Form {...personForm}>
              <form className="space-y-4">
                <FormField
                  control={personForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>名称</FormLabel>
                      <FormControl>
                        <Input placeholder="输入人员名称" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={personForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>角色</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="选择角色" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="操作员">操作员</SelectItem>
                            <SelectItem value="工程师">工程师</SelectItem>
                            <SelectItem value="管理员">管理员</SelectItem>
                            <SelectItem value="安保人员">安保人员</SelectItem>
                            <SelectItem value="访客">访客</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={personForm.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>部门</FormLabel>
                        <FormControl>
                          <Input placeholder="部门名称" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <PositionFields form={personForm} />
              </form>
            </Form>
          </TabsContent>

          {/* 车辆表单 */}
          <TabsContent value="vehicle" className="mt-4">
            <Form {...vehicleForm}>
              <form className="space-y-4">
                <FormField
                  control={vehicleForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>名称</FormLabel>
                      <FormControl>
                        <Input placeholder="输入车辆名称" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={vehicleForm.control}
                    name="plateNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>车牌号</FormLabel>
                        <FormControl>
                          <Input placeholder="如: 京A12345" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={vehicleForm.control}
                    name="vehicleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>类型</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="选择类型" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="car">轿车</SelectItem>
                            <SelectItem value="truck">货车</SelectItem>
                            <SelectItem value="forklift">叉车</SelectItem>
                            <SelectItem value="agv">AGV</SelectItem>
                            <SelectItem value="other">其他</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <PositionFields form={vehicleForm} />
              </form>
            </Form>
          </TabsContent>

          {/* 设备表单 */}
          <TabsContent value="equipment" className="mt-4">
            <Form {...equipmentForm}>
              <form className="space-y-4">
                <FormField
                  control={equipmentForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>名称</FormLabel>
                      <FormControl>
                        <Input placeholder="输入设备名称" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={equipmentForm.control}
                  name="modelId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>模型ID (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="3D模型标识" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <PositionFields form={equipmentForm} />
              </form>
            </Form>
          </TabsContent>

          {/* 区域表单 */}
          <TabsContent value="zone" className="mt-4">
            <Form {...zoneForm}>
              <form className="space-y-4">
                <FormField
                  control={zoneForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>名称</FormLabel>
                      <FormControl>
                        <Input placeholder="输入区域名称" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={zoneForm.control}
                    name="zoneType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>类型</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="选择类型" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="work">作业区</SelectItem>
                            <SelectItem value="storage">存储区</SelectItem>
                            <SelectItem value="passage">通道</SelectItem>
                            <SelectItem value="restricted">限制区</SelectItem>
                            <SelectItem value="danger">危险区</SelectItem>
                            <SelectItem value="custom">自定义</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={zoneForm.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>颜色</FormLabel>
                        <FormControl>
                          <Input type="color" {...field} className="h-9 px-1" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={zoneForm.control}
                    name="width"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>宽度 (m)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={zoneForm.control}
                    name="depth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>深度 (m)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <PositionFields form={zoneForm} />
              </form>
            </Form>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PositionFields({ form }: { form: any }) {
  return (
    <div>
      <FormLabel className="text-xs text-muted-foreground">位置 (米)</FormLabel>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        <FormField
          control={form.control}
          name="posX"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input type="number" placeholder="X" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="posY"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input type="number" placeholder="Y" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="posZ"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input type="number" placeholder="Z" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}
