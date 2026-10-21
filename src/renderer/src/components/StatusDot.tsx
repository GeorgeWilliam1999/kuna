import type { AgentStatus } from '@shared/types'
import { STATUS_LABEL } from '../format'

export function StatusDot({ status }: { status: AgentStatus }): React.JSX.Element {
  return <span className={`dot dot-${status}`} title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]} />
}
