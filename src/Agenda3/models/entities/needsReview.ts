import dayjs from 'dayjs'
import { atom } from 'jotai'

import { classifyNeedsReview } from '@/Agenda3/helpers/needsReview'

import { agendaEntitiesAtom } from './entities'

export const reviewDayAtom = atom(dayjs().format('YYYY-MM-DD'))
export const needsReviewAtom = atom((get) => classifyNeedsReview(get(agendaEntitiesAtom), dayjs(get(reviewDayAtom))))
