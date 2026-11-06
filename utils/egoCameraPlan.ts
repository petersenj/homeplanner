import type { EgoCamera, Point } from '~/types/planner'

export function defaultEgoCamera(rooms: Point[][]): EgoCamera {
  for (const room of rooms) {
    if (room.length < 3) continue
    const xs = room.map((point) => point.x)
    const ys = room.map((point) => point.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    for (let row = 1; row < 32; row++) {
      for (let column = 1; column < 32; column++) {
        const point = {
          x: minX + (maxX - minX) * column / 32,
          y: minY + (maxY - minY) * row / 32,
        }
        if (isEgoCameraPointInsideRooms(point, [room])) {
          return { ...point, rotation: 0 }
        }
      }
    }
  }
  const points = rooms.flat()
  if (!points.length) return { x: 450, y: 335, rotation: 0 }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
    rotation: 0,
  }
}

export function isEgoCameraPointInsideRooms(point: Point, rooms: Point[][]) {
  return rooms.some((room) => {
    let inside = false
    for (let index = 0, previous = room.length - 1; index < room.length; previous = index++) {
      const current = room[index]!
      const last = room[previous]!
      const dx = current.x - last.x
      const dy = current.y - last.y
      const lengthSquared = dx * dx + dy * dy
      const parameter = Math.max(0, Math.min(1, ((point.x - last.x) * dx + (point.y - last.y) * dy) / (lengthSquared || 1)))
      if (Math.hypot(point.x - last.x - parameter * dx, point.y - last.y - parameter * dy) < 0.1) return true
      const crosses = (current.y > point.y) !== (last.y > point.y)
        && point.x < ((last.x - current.x) * (point.y - current.y)) / (last.y - current.y) + current.x
      if (crosses) inside = !inside
    }
    return inside
  })
}
