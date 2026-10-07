import { useLiveQuery } from 'dexie-react-hooks'
import { calibrationTable } from '../../lib/calibration'
import { fmtDuration } from '../../lib/time'
import { Card, cx } from '../ui'

/* Tabela de calibração: quanto cada tipo de bloco leva de verdade. */

const KIND_LABEL: Record<string, string> = {
  fixo: 'fixo',
  tarefa: 'tarefa',
  estudo: 'estudo',
  rotina: 'rotina',
  descanso: 'descanso',
  sono: 'sono',
  deslocamento: 'deslocamento',
}

export function CalibrationSection() {
  const rows = useLiveQuery(() => calibrationTable(), [])

  if (!rows || rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          Ainda sem dados. Conforme você toca em Começar e depois em Feito, o app aprende quanto cada coisa leva de verdade e ajusta as estimativas.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-muted">
            <th className="text-left font-bold px-4 py-2">Bloco</th>
            <th className="text-right font-bold px-2 py-2">N</th>
            <th className="text-right font-bold px-2 py-2">Plan.</th>
            <th className="text-right font-bold px-2 py-2">Real</th>
            <th className="text-right font-bold px-4 py-2">Fator</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.slice(0, 30).map((r) => {
            const off = r.samples >= 5 && (r.factor >= 1.3 || r.factor <= 0.7)
            return (
              <tr key={r.key}>
                <td className="px-4 py-2">
                  <span className="block font-semibold truncate max-w-[9rem]">{r.label}</span>
                  <span className="block text-xs text-muted">{KIND_LABEL[r.kind] ?? r.kind}</span>
                </td>
                <td className="text-right px-2 py-2 tabular text-muted">{r.samples}</td>
                <td className="text-right px-2 py-2 tabular">{fmtDuration(r.medianPlanned)}</td>
                <td className="text-right px-2 py-2 tabular">{fmtDuration(r.medianActual)}</td>
                <td className={cx('text-right px-4 py-2 tabular font-semibold', off ? 'text-warn' : 'text-muted')}>{r.factor.toFixed(2)}×</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted px-4 py-2 border-t border-line">
        Fator = real ÷ planejado. A partir de 5 amostras o app passa a usar o valor real nas estimativas.
      </p>
    </Card>
  )
}
