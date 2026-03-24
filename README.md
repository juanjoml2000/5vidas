# 5 Vidas - Juego de Cartas Online

5 Vidas es una aplicación web de juego de cartas multijugador en tiempo real. Inspirado en mecánicas clásicas de juegos de bazas, el objetivo principal es la supervivencia: predecir con precisión el número de manos ganadas para conservar las vidas hasta el final de la partida.

## Características Principales

- Multijugador en Tiempo Real: Creación de salas dinámicas con sincronización instantánea entre jugadores.
- Bots de Juego: Posibilidad de añadir jugadores automatizados para completar las mesas de juego.
- Chat de Mesa: Sistema de mensajería integrado para la comunicación directa durante las partidas.
- Interfaz Moderna: Desarrollo basado en un diseño oscuro funcional con transiciones y animaciones optimizadas.
- Adaptabilidad: Interfaz responde a diferentes tamaños de pantalla, permitiendo el juego en dispositivos móviles y escritorio.
- Modo Ciego: Mecánica especial en la ronda final (o rondas de una carta) donde el jugador debe apostar basándose en el estado de la mesa sin conocer su propia carta.

## Stack Tecnológico

El proyecto ha sido construido utilizando tecnologías modernas para garantizar rendimiento y escalabilidad:

- Frontend: React con Vite para un entorno de desarrollo y construcción rápido.
- Estilos y UI: Tailwind CSS para el diseño visual y Framer Motion para la gestión de estados de animación.
- Backend como Servicio: Supabase para el manejo de la base de datos PostgreSQL, autenticación de usuarios y suscripciones en tiempo real.
- Iconografía: Lucide React.
- Despliegue: Configurado para entornos de Hosting como Vercel a través de funciones serverless.

## Reglas del Juego

### Objetivo
Cada jugador inicia con 5 vidas. El ganador es el último jugador que mantiene al menos una vida tras completar las rondas necesarias.

### Dinámica
1. Reparto: La cantidad de cartas repartidas disminuye progresivamente en cada ronda (ej. 5, 4, 3, 2, 1).
2. Apuestas: Al inicio de la ronda, los jugadores deben indicar cuántas bazas (rondas individuales) ganarán.
3. Restricción del Último: El último jugador en apostar no puede elegir un número que haga que la suma de apuestas sea igual al total de cartas repartidas. Esto asegura que siempre haya un desajuste y se pierdan vidas.
4. Ronda de 1 Carta: Los jugadores ven las cartas de sus oponentes pero no la suya propia antes de realizar su apuesta.

### Sistema de Vidas
Al finalizar cada ronda, se calcula la diferencia absoluta entre la apuesta realizada y las bazas ganadas. Dicha diferencia se resta del total de vidas del jugador.

## Instalación y Ejecución Local

Para ejecutar este proyecto en un entorno de desarrollo local:

### Prerrequisitos
- Node.js (versión 18 o superior).
- Proyecto configurado en Supabase con las tablas correspondientes.

### Pasos
1. Clonar el repositorio.
2. Instalar las dependencias con: npm install.
3. Configurar las variables de entorno en un archivo .env siguiendo la estructura de .env.example.
4. Ejecutar el script SQL disponible en supabase/schema.sql dentro del panel de Supabase.
5. Iniciar el servidor de desarrollo con: npm run dev.

---

Desarrollado por Juanjo_xrd.
