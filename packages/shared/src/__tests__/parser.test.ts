import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../parser'
import { serializeAst } from '../serializer'
import { DEFAULT_MARKDOWN } from '../default-document'

/** Helper: parse → serialize → re-parse and compare AST structure */
function roundTrip(markdown: string) {
  const ast1 = parseMarkdown(markdown)
  const serialized = serializeAst(ast1)
  const ast2 = parseMarkdown(serialized)
  return { ast1, ast2, serialized }
}

describe('parseMarkdown', () => {
  it('should return a root node', () => {
    const ast = parseMarkdown('# Hello')
    expect(ast.type).toBe('root')
    expect(ast.children.length).toBeGreaterThan(0)
  })

  it('should parse headings', () => {
    const ast = parseMarkdown('## Column Title')
    const heading = ast.children[0]
    expect(heading.type).toBe('heading')
    expect((heading as any).depth).toBe(2)
  })

  it('should parse task lists', () => {
    const ast = parseMarkdown('- [ ] Unchecked\n- [x] Checked')
    const list = ast.children[0] as any
    expect(list.type).toBe('list')
    expect(list.children[0].checked).toBe(false)
    expect(list.children[1].checked).toBe(true)
  })

  it('should handle empty input', () => {
    const ast = parseMarkdown('')
    expect(ast.type).toBe('root')
    expect(ast.children).toHaveLength(0)
  })
})

describe('serializeAst', () => {
  it('should serialize a parsed AST back to markdown', () => {
    const ast = parseMarkdown('## Todo\n\n- [ ] Task 1')
    const markdown = serializeAst(ast)
    expect(markdown).toContain('## Todo')
    expect(markdown).toContain('- [ ] Task 1')
  })
})

describe('round-trip: parse → serialize → parse', () => {
  it('should produce equivalent AST for simple document', () => {
    const md = '## Todo\n\n- [ ] Task 1\n- [x] Task 2\n'
    const { ast1, ast2 } = roundTrip(md)
    // Compare children structure (ignoring position metadata)
    expect(ast2.children.length).toBe(ast1.children.length)
    for (let i = 0; i < ast1.children.length; i++) {
      expect(ast2.children[i].type).toBe(ast1.children[i].type)
    }
  })

  it('should be idempotent (serialize twice gives same result)', () => {
    const md = '## Todo\n\n- [ ] Task 1\n- [x] Task 2\n'
    const { serialized } = roundTrip(md)
    const serialized2 = serializeAst(parseMarkdown(serialized))
    expect(serialized2).toBe(serialized)
  })

  it('should preserve nested task lists', () => {
    const md = '## Todo\n\n- [ ] Parent\n  - [ ] Child 1\n  - [ ] Child 2\n'
    const { serialized } = roundTrip(md)
    expect(serialized).toContain('Parent')
    expect(serialized).toContain('Child 1')
    expect(serialized).toContain('Child 2')
  })

  it('should preserve multiple columns', () => {
    const md = '## Todo\n\n- [ ] Task A\n\n## Done\n\n- [x] Task B\n'
    const { serialized } = roundTrip(md)
    expect(serialized).toContain('## Todo')
    expect(serialized).toContain('## Done')
    expect(serialized).toContain('Task A')
    expect(serialized).toContain('Task B')
  })

  it('should preserve metadata tokens in task content', () => {
    const md = '## Todo\n\n- [ ] Fix bug @alice #urgent priority:high due:2025-04-01 est:3h\n'
    const { serialized } = roundTrip(md)
    expect(serialized).toContain('@alice')
    expect(serialized).toContain('#urgent')
    expect(serialized).toContain('priority:high')
    expect(serialized).toContain('due:2025-04-01')
    expect(serialized).toContain('est:3h')
  })

  it('should handle the DEFAULT_MARKDOWN document', () => {
    const { serialized } = roundTrip(DEFAULT_MARKDOWN)
    // Verify key content is preserved
    expect(serialized).toContain('# Backlog')
    expect(serialized).toContain('# In Progress')
    expect(serialized).toContain('# In Review')
    expect(serialized).toContain('# Done')
    // Idempotency
    const serialized2 = serializeAst(parseMarkdown(serialized))
    expect(serialized2).toBe(serialized)
  })

  it('should preserve H1 title', () => {
    const md = '# My Board\n\n## Todo\n\n- [ ] Task\n'
    const { serialized } = roundTrip(md)
    expect(serialized).toContain('# My Board')
  })
})
