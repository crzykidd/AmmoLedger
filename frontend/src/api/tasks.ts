import { api } from './client'
import type { TaskConstraints, TaskHistory, TaskRegistry } from '@/types'

export const getTasks = () =>
  api.get<TaskRegistry[]>('/tasks')

export const getTaskHistory = (taskKey?: string) =>
  taskKey
    ? api.get<TaskHistory[]>(`/tasks/${taskKey}/history`)
    : api.get<TaskHistory[]>('/tasks/history')

export const getTaskConstraints = () =>
  api.get<Record<string, TaskConstraints>>('/tasks/constraints')

export const runTask = (taskKey: string) =>
  api.post<TaskHistory>(`/tasks/${taskKey}/run`, {})

export const updateTask = (
  taskKey: string,
  updates: { enabled?: boolean; interval_type?: string; interval_value?: string },
) => api.patch<TaskRegistry>(`/tasks/${taskKey}`, updates)
