export type ShapeEntry = {
  /** [lon, lat] pairs in shape_pt_sequence order. */
  coords: [number, number][]
  /** Cumulative metres to each coordinate; same length as coords, cum[0] === 0. */
  cum: number[]
  length: number
}

import shapesJson from './shapes.json'

export const shapesById = shapesJson as unknown as Record<string, ShapeEntry>
