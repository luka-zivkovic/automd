// Types
export type {
  TaskMetadata,
  Task,
  Column,
  DocumentState,
  BoardMeta,
  BoardVocabulary,
  IdCache,
  BoardFile,
  ItemType,
  Project,
} from './types.js'

// Parser & Serializer
export { parseMarkdown } from './parser.js'
export { serializeAst } from './serializer.js'

// Frontmatter
export { extractFrontmatter, setFrontmatter, removeFrontmatter } from './frontmatter-parser.js'

// ID Annotation
export { createIdCache, annotateIds } from './id-annotator.js'

// Task Extraction
export {
  extractTasksAndColumns,
  detectColumnDepth,
  detectHeadingStructure,
} from './task-extractor.js'
export type { HeadingStructure } from './task-extractor.js'

// Metadata
export { emptyMetadata, parseMetadata } from './metadata-parser.js'
export { serializeMetadata } from './metadata-serializer.js'

// Task Mutations
export {
  toggleTask,
  moveTask,
  addTask,
  updateTaskContent,
  updateTaskMetadata,
  updateTaskDescription,
  updateAcceptanceCriteria,
  updateLearnings,
  deleteTask,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
  addColumn,
  renameColumn,
  deleteColumn,
  moveColumn,
} from './task-mutator.js'

// Tag Utils
export { normalizeTag } from './tag-utils.js'

// Default Document
export { DEFAULT_MARKDOWN, DEFAULT_PAGE_MARKDOWN, DEFAULT_KNOWLEDGE_MARKDOWN } from './default-document.js'

// Prompt Catalog
export type { PromptDefinition, TemplatePrompt, TemplatePromptPlaceholder } from './prompt-catalog.js'
export { MCP_PROMPTS, TEMPLATE_PROMPTS } from './prompt-catalog.js'

// Text Search
export { tokenizeForSearch, computeScore, searchAndRank, STOP_WORDS } from './text-search.js'
