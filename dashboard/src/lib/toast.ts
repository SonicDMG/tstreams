import { toast } from 'sonner'

export function showError(message: string) {
  toast.error(message, { duration: 5000 })
}

export function showSuccess(message: string) {
  toast.success(message, { duration: 3000 })
}

/** Extract a plain-language message from a fetch error or API response error */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Something went wrong'
}
