export const keyboardKeySymbols = {
  ArrowUp: { symbol: '↑', label: 'Arrow up' },
  ArrowLeft: { symbol: '←', label: 'Arrow left' },
  ArrowDown: { symbol: '↓', label: 'Arrow down' },
  ArrowRight: { symbol: '→', label: 'Arrow right' },
  Shift: { symbol: '⇧', label: 'Shift' },
  Control: { symbol: 'Ctrl', label: 'Control' },
  Delete: { symbol: '⌫', label: 'Delete' },
  Enter: { symbol: '↵', label: 'Enter' },
  Space: { symbol: '␣', label: 'Space' },
  Escape: { symbol: 'Esc', label: 'Escape' },
} as const

export type KeyboardKey = keyof typeof keyboardKeySymbols
type MouseButton = 'left' | 'right' | 'wheel'

export const firstPersonInteractions: {
  keyboard: { keys: readonly KeyboardKey[]; description: string }[]
  mouse: { button?: MouseButton; gesture: string; description: string }[]
} = {
  keyboard: [
    {
      keys: ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'],
      description: 'Move through the room.',
    },
    {
      keys: ['Escape'],
      description: 'Exit first-person mode.',
    },
    {
      keys: ['Control'],
      description: 'Hold Ctrl with arrow keys to move the selected object.',
    },
    {
      keys: ['Delete'],
      description: 'Remove the selected object.',
    },
  ],
  mouse: [
    {
      gesture: 'Move mouse',
      description: 'Look around.',
    },
    {
      button: 'left',
      gesture: 'Click',
      description: 'Select an object.',
    },
  ],
}

export const keyboardMouseInteractions = {
  '2d': {
    keyboard: [
      {
        keys: ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'],
        description: 'Move the selected object or wall.',
      },
      {
        keys: ['Shift'],
        description: 'Draw with free angles, constrain wall or corner drags to one axis, or rotate in 1° steps.',
      },
      {
        keys: ['Delete'],
        description: 'Remove the selected object.',
      },
      {
        keys: ['Enter', 'Space'],
        description: 'Remove a focused measurement.',
      },
    ],
    mouse: [
      {
        button: 'left',
        gesture: 'Click',
        description: 'Select an object or wall; place room corners or measurement points.',
      },
      {
        button: 'left',
        gesture: 'Drag',
        description: 'Move objects, walls, or corners; drag a rotation handle to rotate.',
      },
      {
        button: 'right',
        gesture: 'Right-drag / right-click',
        description: 'Pan the plan, or right-click a room corner to remove it.',
      },
      {
        button: 'wheel',
        gesture: 'Scroll',
        description: 'Zoom in or out.',
      },
    ],
  },
  '3d': {
    keyboard: [
      {
        keys: ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'],
        description: 'Move the selected object or wall.',
      },
      {
        keys: ['Delete'],
        description: 'Remove the selected object.',
      },
    ],
    mouse: [
      {
        button: 'left',
        gesture: 'Click / drag',
        description: 'Select objects or walls; drag to orbit around the room.',
      },
      {
        button: 'right',
        gesture: 'Right-drag',
        description: 'Pan the camera.',
      },
      {
        button: 'wheel',
        gesture: 'Scroll',
        description: 'Zoom in or out.',
      },
    ],
  },
} as const satisfies Record<'2d' | '3d', {
  keyboard: { keys: readonly KeyboardKey[]; description: string }[]
  mouse: { button: MouseButton; gesture: string; description: string }[]
}>
