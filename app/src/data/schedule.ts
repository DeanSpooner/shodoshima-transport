export type ScheduleEntry = {
  trip_id: string
  route_id: string
  arrival_time: string
  departure_time: string
  stop_sequence: number
  headsign: string
  headsign_en: string
}

import scheduleJson from './schedule.json'

export const scheduleByStopId = scheduleJson as unknown as Record<string, ScheduleEntry[]>
