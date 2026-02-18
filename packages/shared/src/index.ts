// Types
export type {
  TaskMetadata,
  Task,
  Column,
  DocumentState,
  IdCache,
  BoardFile,
  Project,
} from './types'

// Parser & Serializer
export { parseMarkdown } from './parser'
export { serializeAst } from './serializer'

// ID Annotation
export { createIdCache, annotateIds } from './id-annotator'

// Task Extraction
export {
  extractTasksAndColumns,
  detectColumnDepth,
  detectHeadingStructure,
} from './task-extractor'
export type { HeadingStructure } from './task-extractor'

// Metadata
export { emptyMetadata, parseMetadata } from './metadata-parser'
export { serializeMetadata } from './metadata-serializer'

// Task Mutations
export {
  toggleTask,
  moveTask,
  addTask,
  updateTaskContent,
  updateTaskMetadata,
  updateTaskDescription,
  deleteTask,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
  addColumn,
  renameColumn,
  deleteColumn,
  moveColumn,
} from './task-mutator'

// Default Document
export { DEFAULT_MARKDOWN } from './default-document'
