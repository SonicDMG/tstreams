import { projectHue } from '../lib/utils'

type Status = 'pending' | 'in_progress' | 'blocked' | 'done' | 'open' | 'decided' | string

const STATUS_STYLES: Record<string, string> = {
  pending:     'bg-[rgba(99,110,123,0.2)]  text-muted',
  in_progress: 'bg-[rgba(57,208,216,0.15)] text-cyan',
  done:        'bg-[rgba(63,185,80,0.15)]  text-green',
  blocked:     'bg-[rgba(248,81,73,0.15)]  text-red',
  open:        'bg-[rgba(99,110,123,0.2)]  text-muted',
  decided:     'bg-[rgba(188,140,255,0.15)] text-purple',
}

export function StatusBadge({ status }: { status: Status }) {
  const cls = STATUS_STYLES[status] ?? 'bg-[rgba(99,110,123,0.2)] text-muted'
  return (
    <span className={`inline-block text-[10px] px-[7px] py-[2px] rounded-full font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  )
}

const TASK_TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  implementation: { bg: 'rgba(88,166,255,0.15)',  color: '#58a6ff', label: 'impl' },
  testing:        { bg: 'rgba(57,208,216,0.15)',  color: '#39d0d8', label: 'test' },
  documentation:  { bg: 'rgba(188,140,255,0.15)', color: '#bc8cff', label: 'docs' },
  research:       { bg: 'rgba(210,153,34,0.15)',  color: '#d29922', label: 'research' },
  review:         { bg: 'rgba(63,185,80,0.15)',   color: '#3fb950', label: 'review' },
}

export function TaskTypeBadge({ taskType }: { taskType?: string }) {
  const s = TASK_TYPE_STYLES[taskType ?? ''] ?? { bg: 'rgba(99,110,123,0.15)', color: '#636e7b', label: taskType ?? '?' }
  return (
    <span className="inline-block text-[10px] px-[7px] py-[2px] rounded-full font-semibold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

const VERIFICATION_STYLES: Record<string, [string, string]> = {
  verified:     ['#3fb950', 'verified ✓'],
  partial:      ['#d29922', 'partial ⚠'],
  needs_review: ['#58a6ff', 'needs review ℹ'],
  unverified:   ['#636e7b', 'unverified'],
}

export function VerificationBadge({ status }: { status?: string }) {
  const [color, label] = VERIFICATION_STYLES[status ?? 'unverified'] ?? ['#636e7b', status ?? '?']
  return (
    <span className="inline-block text-[10px] px-[7px] py-[2px] rounded-full font-semibold uppercase tracking-wide"
      style={{ background: `${color}26`, color }}>
      {label}
    </span>
  )
}

const TESTING_STYLES: Record<string, [string, string]> = {
  passed:  ['#3fb950', 'passed ✓'],
  failed:  ['#f85149', 'failed ✗'],
  running: ['#d29922', 'running ⟳'],
  pending: ['#636e7b', 'pending test'],
}

export function TestingBadge({ status }: { status?: string }) {
  const [color, label] = TESTING_STYLES[status ?? 'pending'] ?? ['#636e7b', status ?? '?']
  return (
    <span className="inline-block text-[10px] px-[7px] py-[2px] rounded-full font-semibold uppercase tracking-wide"
      style={{ background: `${color}26`, color }}>
      {label}
    </span>
  )
}

export function ProjectPill({ name }: { name?: string }) {
  if (!name || name === 'default') return null
  const hue = projectHue(name)
  return (
    <span className="inline-block text-[10px] px-[7px] py-[1px] rounded-full font-semibold tracking-wide whitespace-nowrap border"
      style={{
        background: `hsla(${hue},60%,55%,0.15)`,
        color: `hsl(${hue},70%,65%)`,
        borderColor: `hsla(${hue},60%,55%,0.3)`,
      }}>
      {name}
    </span>
  )
}

export function GhBadge({ issueNumber, repo }: { issueNumber?: number; repo?: string }) {
  if (!issueNumber) return <span className="text-muted">—</span>
  const url = repo ? `https://github.com/${repo}/issues/${issueNumber}` : '#'
  return (
    <a href={url} target="_blank" rel="noopener"
      className="inline-block text-[10px] px-[6px] py-[1px] bg-surface text-blue border border-border2 rounded no-underline hover:bg-card">
      #{issueNumber} ↗
    </a>
  )
}

export function VersionBadge({ name }: { name: string }) {
  return (
    <span className="inline-block text-[10px] px-[7px] py-[2px] rounded-full font-semibold bg-[rgba(88,166,255,0.15)] text-blue">
      {name}
    </span>
  )
}
