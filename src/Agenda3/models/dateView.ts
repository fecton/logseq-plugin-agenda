import { atom } from 'jotai'

import { getDateView, normalizeDateView } from '@/Agenda3/helpers/dateViews'

import { appAtom } from './app'
import { settingsAtom } from './settings'

export const dateViewAtom = atom((get) => {
  const settings = get(settingsAtom)
  return getDateView(
    normalizeDateView(settings.viewOptions?.dateRange),
    get(appAtom).anchorDate,
    settings.general?.startOfWeek,
  )
})
