export type Point = { x: number; y: number }
export type IdentifiedSegment = { id: number; start: Point; end: Point }
export type Measurement = IdentifiedSegment
export type RoomEdge = {
  id: string
  start: Point
  end: Point
  label: Point
  labelAngle: number
  length: number
  orientations: number[]
}
export type DragMeasurement = { id: string; start: Point; end: Point; label: Point; text: string }
export type LiveMeasurement = Omit<DragMeasurement, 'id'>
export type CameraVector = { x: number; y: number; z: number }
export type CameraSnapshot = {
  position: CameraVector
  target: CameraVector
  up: CameraVector
  isTopDown: boolean
  showCameraFacingWalls: boolean
}
