import { useRef, useState, type ReactNode } from 'react'
import { Button } from '../ui'
import { readFileText } from '../../lib/importers'

/**
 * Botão que abre o seletor de arquivo e entrega o texto lido.
 * Erros lançados por onText são mostrados abaixo do botão.
 */
export function FileButton({
  accept,
  children,
  onText,
  variant = 'secondary',
  className,
}: {
  accept: string
  children: ReactNode
  onText: (text: string, file: File) => Promise<void> | void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className={className}>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          setError(null)
          try {
            const text = await readFileText(file)
            await onText(text, file)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Não deu certo. Tente outro arquivo.')
          } finally {
            setBusy(false)
          }
        }}
      />
      <Button type="button" variant={variant} disabled={busy} onClick={() => ref.current?.click()} className="w-full">
        {busy ? 'Lendo…' : children}
      </Button>
      {error && (
        <p className="text-sm text-warn mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
