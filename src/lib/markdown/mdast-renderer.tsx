import type { Root, RootContent, PhrasingContent, Table, TableRow, ListItem } from 'mdast'

/**
 * Render an MDAST tree to React elements.
 * Pure function — no side effects, no state.
 */
export function renderMdast(ast: Root): React.ReactNode {
  return (
    <div className="document-prose">
      {ast.children.map((node, i) => renderBlock(node, i))}
    </div>
  )
}

function renderBlock(node: RootContent, key: number): React.ReactNode {
  switch (node.type) {
    case 'heading': {
      const d = node.depth
      const children = renderInline(node.children)
      if (d === 1) return <h1 key={key}>{children}</h1>
      if (d === 2) return <h2 key={key}>{children}</h2>
      if (d === 3) return <h3 key={key}>{children}</h3>
      if (d === 4) return <h4 key={key}>{children}</h4>
      if (d === 5) return <h5 key={key}>{children}</h5>
      return <h6 key={key}>{children}</h6>
    }

    case 'paragraph':
      return <p key={key}>{renderInline(node.children)}</p>

    case 'blockquote':
      return (
        <blockquote key={key}>
          {node.children.map((child, i) => renderBlock(child as RootContent, i))}
        </blockquote>
      )

    case 'code':
      return (
        <pre key={key}>
          <code className={node.lang ? `language-${node.lang}` : undefined}>
            {node.value}
          </code>
        </pre>
      )

    case 'list': {
      const items = node.children.map((item, i) => renderListItem(item, i))
      if (node.ordered) {
        return <ol key={key} start={node.start != null ? node.start : undefined}>{items}</ol>
      }
      return <ul key={key}>{items}</ul>
    }

    case 'table':
      return renderTable(node, key)

    case 'thematicBreak':
      return <hr key={key} />

    case 'html':
      // Skip raw HTML for safety
      return null

    case 'yaml':
      // Skip frontmatter
      return null

    default:
      return null
  }
}

function renderListItem(node: ListItem, key: number): React.ReactNode {
  const isTask = typeof node.checked === 'boolean'

  if (isTask) {
    return (
      <li key={key} className="task-list-item">
        <input type="checkbox" checked={node.checked!} disabled readOnly className="mt-1" />
        <span>
          {node.children.map((child, i) => {
            if (child.type === 'paragraph') {
              return <span key={i}>{renderInline(child.children)}</span>
            }
            return renderBlock(child as RootContent, i)
          })}
        </span>
      </li>
    )
  }

  return (
    <li key={key}>
      {node.children.map((child, i) => {
        // If a listItem has a single paragraph child, render inline to avoid extra <p>
        if (child.type === 'paragraph' && node.children.length === 1) {
          return renderInline(child.children)
        }
        return renderBlock(child as RootContent, i)
      })}
    </li>
  )
}

function renderTable(node: Table, key: number): React.ReactNode {
  const [headerRow, ...bodyRows] = node.children
  const align = node.align ?? []

  function cellStyle(colIndex: number): React.CSSProperties | undefined {
    const a = align[colIndex]
    return a ? { textAlign: a } : undefined
  }

  return (
    <table key={key}>
      {headerRow && (
        <thead>
          <tr>
            {(headerRow as TableRow).children.map((cell, ci) => (
              <th key={ci} style={cellStyle(ci)}>
                {renderInline(cell.children)}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {bodyRows.map((row, ri) => (
          <tr key={ri}>
            {(row as TableRow).children.map((cell, ci) => (
              <td key={ci} style={cellStyle(ci)}>
                {renderInline(cell.children)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function renderInline(nodes: PhrasingContent[]): React.ReactNode {
  return nodes.map((node, i) => renderPhrasingNode(node, i))
}

function renderPhrasingNode(node: PhrasingContent, key: number): React.ReactNode {
  switch (node.type) {
    case 'text':
      return node.value

    case 'strong':
      return <strong key={key}>{renderInline(node.children)}</strong>

    case 'emphasis':
      return <em key={key}>{renderInline(node.children)}</em>

    case 'delete':
      return <del key={key}>{renderInline(node.children)}</del>

    case 'inlineCode':
      return <code key={key}>{node.value}</code>

    case 'link': {
      const href = node.url
      if (href && /^(javascript|data):/i.test(href)) {
        return <span key={key}>{renderInline(node.children)}</span>
      }
      return (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer" title={node.title ?? undefined}>
          {renderInline(node.children)}
        </a>
      )
    }

    case 'image': {
      const imgSrc = node.url
      if (imgSrc && /^(javascript|data):/i.test(imgSrc)) {
        return <span key={key}>{node.alt ?? ''}</span>
      }
      return <img key={key} src={imgSrc} alt={node.alt ?? ''} title={node.title ?? undefined} />
    }

    case 'break':
      return <br key={key} />

    default:
      return null
  }
}
