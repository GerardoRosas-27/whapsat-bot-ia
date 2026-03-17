#!/bin/bash
# Script para ver los logs del servidor
# Uso: ./scripts/view-logs.sh [número de líneas]

LINES=${1:-50}
LOG_FILE="logs/server.log"

if [ -f "$LOG_FILE" ]; then
    echo "=== Últimas $LINES líneas del log ==="
    echo ""
    tail -n $LINES "$LOG_FILE"
    echo ""
    echo "=== Fin del log ==="
    echo ""
    echo "Para ver todas las líneas relacionadas con DELETE, ejecuta:"
    echo "grep '[DELETE]' logs/server.log"
else
    echo "El archivo de logs no existe aún."
    echo "Asegúrate de que el servidor esté ejecutándose y que hayas intentado eliminar una cita."
fi
