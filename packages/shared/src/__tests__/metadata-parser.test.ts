import { describe, it, expect } from 'vitest'
import { parseMetadata, emptyMetadata } from '../metadata-parser'
import { serializeMetadata } from '../metadata-serializer'
import type { TaskMetadata } from '../types'

describe('emptyMetadata', () => {
  it('should return default empty metadata', () => {
    const meta = emptyMetadata()
    expect(meta.assignees).toEqual([])
    expect(meta.labels).toEqual([])
    expect(meta.dueDate).toBeNull()
    expect(meta.estimate).toBeNull()
    expect(meta.priority).toBeNull()
    expect(meta.createdBy).toBeNull()
    expect(meta.builtBy).toBeNull()
    expect(meta.archived).toBe(false)
    expect(meta.completedAt).toBeNull()
    expect(meta.knowledge).toBe(false)
  })
})

describe('parseMetadata', () => {
  it('should extract a single assignee', () => {
    const { metadata, displayContent } = parseMetadata('Fix bug @alice')
    expect(metadata.assignees).toEqual(['alice'])
    expect(displayContent).toBe('Fix bug')
  })

  it('should extract multiple assignees', () => {
    const { metadata, displayContent } = parseMetadata('Fix bug @alice @bob @charlie')
    expect(metadata.assignees).toEqual(['alice', 'bob', 'charlie'])
    expect(displayContent).toBe('Fix bug')
  })

  it('should extract a single label', () => {
    const { metadata } = parseMetadata('Fix bug #urgent')
    expect(metadata.labels).toEqual(['urgent'])
  })

  it('should extract multiple labels', () => {
    const { metadata } = parseMetadata('Fix bug #frontend #backend #critical')
    expect(metadata.labels).toEqual(['frontend', 'backend', 'critical'])
  })

  it('should extract due date', () => {
    const { metadata } = parseMetadata('Task due:2025-04-15')
    expect(metadata.dueDate).toBe('2025-04-15')
  })

  it('should extract estimate with h suffix', () => {
    const { metadata } = parseMetadata('Task est:8h')
    expect(metadata.estimate).toBe(8)
  })

  it('should extract estimate without h suffix', () => {
    const { metadata } = parseMetadata('Task est:3')
    expect(metadata.estimate).toBe(3)
  })

  it('should extract decimal estimates', () => {
    const { metadata } = parseMetadata('Task est:2.5h')
    expect(metadata.estimate).toBe(2.5)
  })

  it('should extract priority', () => {
    const { metadata } = parseMetadata('Task priority:high')
    expect(metadata.priority).toBe('high')
  })

  it('should handle case-insensitive priority', () => {
    const { metadata } = parseMetadata('Task Priority:HIGH')
    expect(metadata.priority).toBe('high')
  })

  it('should extract all priority levels', () => {
    expect(parseMetadata('Task priority:high').metadata.priority).toBe('high')
    expect(parseMetadata('Task priority:medium').metadata.priority).toBe('medium')
    expect(parseMetadata('Task priority:low').metadata.priority).toBe('low')
  })

  it('should extract created-by', () => {
    const { metadata } = parseMetadata('Task created-by:sarah')
    expect(metadata.createdBy).toBe('sarah')
  })

  it('should extract built-by', () => {
    const { metadata } = parseMetadata('Task built-by:bob')
    expect(metadata.builtBy).toBe('bob')
  })

  it('should extract archived flag', () => {
    const { metadata } = parseMetadata('Old task archived:true')
    expect(metadata.archived).toBe(true)
  })

  it('should handle case-insensitive archived', () => {
    const { metadata } = parseMetadata('Task Archived:True')
    expect(metadata.archived).toBe(true)
  })

  it('should extract completed-at date', () => {
    const { metadata, displayContent } = parseMetadata('Task completed-at:2025-06-15')
    expect(metadata.completedAt).toBe('2025-06-15')
    expect(displayContent).toBe('Task')
  })

  it('should handle case-insensitive completed-at', () => {
    const { metadata } = parseMetadata('Task Completed-At:2025-06-15')
    expect(metadata.completedAt).toBe('2025-06-15')
  })

  it('should extract knowledge flag', () => {
    const { metadata, displayContent } = parseMetadata('Auth patterns knowledge:true')
    expect(metadata.knowledge).toBe(true)
    expect(displayContent).toBe('Auth patterns')
  })

  it('should handle case-insensitive knowledge', () => {
    const { metadata } = parseMetadata('Task Knowledge:True')
    expect(metadata.knowledge).toBe(true)
  })

  it('should return empty metadata for plain text', () => {
    const { metadata, displayContent } = parseMetadata('Just a simple task')
    expect(metadata).toEqual(emptyMetadata())
    expect(displayContent).toBe('Just a simple task')
  })

  it('should parse all tokens combined', () => {
    const content =
      'Implement feature @alice @bob #backend #api priority:high due:2025-04-01 est:12h created-by:sarah built-by:alex completed-at:2025-04-02 knowledge:true archived:true'
    const { metadata, displayContent } = parseMetadata(content)

    expect(metadata.assignees).toEqual(['alice', 'bob'])
    expect(metadata.labels).toEqual(['backend', 'api'])
    expect(metadata.priority).toBe('high')
    expect(metadata.dueDate).toBe('2025-04-01')
    expect(metadata.estimate).toBe(12)
    expect(metadata.createdBy).toBe('sarah')
    expect(metadata.builtBy).toBe('alex')
    expect(metadata.completedAt).toBe('2025-04-02')
    expect(metadata.knowledge).toBe(true)
    expect(metadata.archived).toBe(true)
    expect(displayContent).toBe('Implement feature')
  })

  it('should handle usernames with hyphens', () => {
    const { metadata } = parseMetadata('Task @user-name created-by:some-user')
    expect(metadata.assignees).toEqual(['user-name'])
    expect(metadata.createdBy).toBe('some-user')
  })

  it('should handle labels with underscores', () => {
    const { metadata } = parseMetadata('Task #my_label')
    expect(metadata.labels).toEqual(['my_label'])
  })

  it('should strip all tokens cleanly from display content', () => {
    const { displayContent } = parseMetadata(
      'Task @user #label priority:high due:2025-01-01 est:5h created-by:x built-by:y completed-at:2025-01-02 knowledge:true archived:true'
    )
    expect(displayContent).toBe('Task')
    // No extra whitespace
    expect(displayContent).not.toMatch(/\s{2,}/)
  })
})

describe('serializeMetadata', () => {
  it('should return display content when no metadata', () => {
    const result = serializeMetadata('Just a task', emptyMetadata())
    expect(result).toBe('Just a task')
  })

  it('should append assignees', () => {
    const meta = { ...emptyMetadata(), assignees: ['alice', 'bob'] }
    const result = serializeMetadata('Task', meta)
    expect(result).toBe('Task @alice @bob')
  })

  it('should append labels', () => {
    const meta = { ...emptyMetadata(), labels: ['frontend', 'urgent'] }
    const result = serializeMetadata('Task', meta)
    expect(result).toBe('Task #frontend #urgent')
  })

  it('should append priority', () => {
    const meta = { ...emptyMetadata(), priority: 'high' as const }
    const result = serializeMetadata('Task', meta)
    expect(result).toBe('Task priority:high')
  })

  it('should append due date', () => {
    const meta = { ...emptyMetadata(), dueDate: '2025-04-01' }
    const result = serializeMetadata('Task', meta)
    expect(result).toBe('Task due:2025-04-01')
  })

  it('should append estimate with h suffix', () => {
    const meta = { ...emptyMetadata(), estimate: 5 }
    const result = serializeMetadata('Task', meta)
    expect(result).toBe('Task est:5h')
  })

  it('should append created-by and built-by', () => {
    const meta = { ...emptyMetadata(), createdBy: 'sarah', builtBy: 'alex' }
    const result = serializeMetadata('Task', meta)
    expect(result).toContain('created-by:sarah')
    expect(result).toContain('built-by:alex')
  })

  it('should append archived flag', () => {
    const meta = { ...emptyMetadata(), archived: true }
    const result = serializeMetadata('Task', meta)
    expect(result).toContain('archived:true')
  })

  it('should append completed-at date', () => {
    const meta = { ...emptyMetadata(), completedAt: '2025-06-15' }
    const result = serializeMetadata('Task', meta)
    expect(result).toBe('Task completed-at:2025-06-15')
  })

  it('should append knowledge flag', () => {
    const meta = { ...emptyMetadata(), knowledge: true }
    const result = serializeMetadata('Task', meta)
    expect(result).toBe('Task knowledge:true')
  })

  it('should serialize all tokens in correct order', () => {
    const meta: TaskMetadata = {
      assignees: ['alice'],
      labels: ['backend'],
      priority: 'high',
      dueDate: '2025-04-01',
      estimate: 8,
      createdBy: 'sarah',
      builtBy: 'alex',
      completedAt: '2025-04-02',
      knowledge: true,
      archived: true,
    }
    const result = serializeMetadata('Task', meta)
    expect(result).toBe(
      'Task @alice #backend priority:high due:2025-04-01 est:8h created-by:sarah built-by:alex completed-at:2025-04-02 knowledge:true archived:true'
    )
  })
})

describe('parseMetadata ↔ serializeMetadata round-trip', () => {
  it('should round-trip metadata correctly', () => {
    const original: TaskMetadata = {
      assignees: ['alice', 'bob'],
      labels: ['frontend', 'urgent'],
      priority: 'medium',
      dueDate: '2025-06-15',
      estimate: 4,
      createdBy: 'sarah',
      builtBy: null,
      archived: false,
      completedAt: null,
      knowledge: false,
    }
    const serialized = serializeMetadata('Build feature', original)
    const { metadata, displayContent } = parseMetadata(serialized)

    expect(displayContent).toBe('Build feature')
    expect(metadata.assignees).toEqual(original.assignees)
    expect(metadata.labels).toEqual(original.labels)
    expect(metadata.priority).toBe(original.priority)
    expect(metadata.dueDate).toBe(original.dueDate)
    expect(metadata.estimate).toBe(original.estimate)
    expect(metadata.createdBy).toBe(original.createdBy)
    expect(metadata.builtBy).toBeNull()
    expect(metadata.archived).toBe(false)
    expect(metadata.completedAt).toBeNull()
    expect(metadata.knowledge).toBe(false)
  })

  it('should round-trip knowledge metadata correctly', () => {
    const original: TaskMetadata = {
      assignees: [],
      labels: ['architecture'],
      priority: null,
      dueDate: null,
      estimate: null,
      createdBy: null,
      builtBy: null,
      archived: false,
      completedAt: '2025-06-15',
      knowledge: true,
    }
    const serialized = serializeMetadata('Auth patterns', original)
    const { metadata, displayContent } = parseMetadata(serialized)

    expect(displayContent).toBe('Auth patterns')
    expect(metadata.labels).toEqual(['architecture'])
    expect(metadata.completedAt).toBe('2025-06-15')
    expect(metadata.knowledge).toBe(true)
  })
})
