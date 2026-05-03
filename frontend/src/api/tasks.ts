import { api } from './client'
import type { TaskHistory, TaskRegistry } from '@/types'

export const getTasks = () =>
  api.get<TaskRegistry[]>('/tasks')

export const getTaskHistory = (taskKey?: string) =>
  taskKey
    ? api.get<TaskHistory[]>(`/tasks/${taskKey}/history`)
    : api.get<TaskHistory[]>('/tasks/history')

export const runTask = (taskKey: string) =>
  api.post<TaskHistory>(`/tasks/${taskKey}/run`, {})

export const updateTask = (
  taskKey: string,
  updates: { enabled?: boolean; interval_value?: string },
) => api.patch<TaskRegistry>(`/tasks/${taskKey}`, updates)
