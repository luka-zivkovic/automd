import { unified } from 'unified'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'
import type { Root } from 'mdast'

const serializer = unified()
  .use(remarkStringify, {
    bullet: '-',
    listItemIndent: 'one',
    rule: '-',
  })
  .use(remarkGfm)

export function serializeAst(ast: Root): string {
  return serializer.stringify(ast)
}
