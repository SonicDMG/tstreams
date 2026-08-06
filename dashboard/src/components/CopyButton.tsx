import { useState } from 'react'
import { copyText } from '../lib/utils'

interface CopyButtonProps {
  type: string
  id: number
  title: string
}

export function CopyButton({ type, id, title }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    copyText(`${type} #${id}: ${title}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={handleClick}
      tabIndex={-1}
      title="Copy ID & title"
      className={`inline-flex items-center justify-center w-[18px] h-[18px] ml-[5px] bg-transparent border-0 cursor-pointer rounded align-middle p-0 transition-colors
        ${copied ? 'text-green opacity-100' : 'text-muted opacity-35 hover:text-foreground hover:opacity-100 hover:bg-surface'}`}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z"/>
        <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z"/>
      </svg>
    </button>
  )
}
