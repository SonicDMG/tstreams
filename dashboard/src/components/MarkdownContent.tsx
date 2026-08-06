import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  children: string
  className?: string
}

/**
 * Renders Markdown (CommonMark + GFM tables/strikethrough/task lists).
 * Scoped styles live in index.css under .md-content.
 */
export function MarkdownContent({ children, className = '' }: Props) {
  return (
    <div className={`md-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
