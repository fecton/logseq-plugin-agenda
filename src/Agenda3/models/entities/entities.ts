import { atom } from 'jotai'

import { getAgendaEntities } from '@/Agenda3/helpers/task'
import type { AgendaEntity } from '@/types/entity'

import { settingsAtom } from '../settings'

export const agendaEntitiesAtom = atom<AgendaEntity[]>([])
const requestVersionAtom = atom(0)
export const invalidateEntitiesAtom = atom(null, (get, set) => set(requestVersionAtom, get(requestVersionAtom) + 1))
export const refreshEntitiesAtom = atom(null, async (get, set) => {
  const settings = get(settingsAtom)
  if (!settings.isInitialized) return
  set(invalidateEntitiesAtom)
  const version = get(requestVersionAtom)
  const entities = await getAgendaEntities(settings)
  if (get(requestVersionAtom) === version && get(settingsAtom) === settings) set(agendaEntitiesAtom, entities)
})
