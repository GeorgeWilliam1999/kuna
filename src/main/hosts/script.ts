import { createHash } from 'node:crypto'
import raw from '../remote/kuna.sh?raw'

/** Version = content hash, so any change to the helper triggers a reinstall. */
export const KUNA_VERSION = createHash('sha1').update(raw).digest('hex').slice(0, 12)

export const KUNA_SCRIPT = raw.replace('__KUNA_VERSION__', KUNA_VERSION)
