import { createContext } from 'react'

/** True inside a sidebar row or a bar's grid cell (design exploration): that
 *  wrapper drags the item, so the widget inside must not start a native drag
 *  of its own, which would draw a second grip and, in the sidebar, cancel the
 *  row's drag. */
export const DragOwnedByParent = createContext(false)
