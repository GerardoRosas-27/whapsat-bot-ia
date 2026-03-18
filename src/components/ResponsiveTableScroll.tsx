'use client'

import type { ReactNode } from 'react'

/**
 * Contenedor con scroll horizontal para tablas en pantallas pequeñas.
 * No altera la lógica de los hijos; solo el layout.
 */
export default function ResponsiveTableScroll({
  children,
  minWidth = 720
}: {
  children: ReactNode
  /** Ancho mínimo del contenido para activar la barra de desplazamiento en móviles */
  minWidth?: number
}) {
  return (
    <div
      style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        width: '100%',
        maxWidth: '100%',
        overscrollBehaviorX: 'contain'
      }}
      className="responsive-table-scroll"
    >
      <div style={{ minWidth }}>{children}</div>
    </div>
  )
}
