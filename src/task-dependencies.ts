import type { Task } from './data'

export function taskDependencies(task: Task, tasks: Map<string, Task>) {
  return (task.dependsOn ?? []).flatMap(id => {
    const dependency = tasks.get(id)
    return dependency?.project === task.project && dependency.id !== task.id ? [dependency] : []
  })
}

export function blockedTask(task: Task, tasks: Map<string, Task>) {
  return task.status !== 'Done' && taskDependencies(task,tasks).some(dependency => dependency.status !== 'Done')
}

export function dependsOnTask(task: Task, target: string, tasks: Map<string, Task>) {
  const visited = new Set<string>()
  const queue = [task]
  while (queue.length) {
    const next = queue.pop()!
    if (next.id === target) return true
    if (visited.has(next.id)) continue
    visited.add(next.id)
    for (const dependency of taskDependencies(next,tasks)) queue.push(dependency)
  }
  return false
}
