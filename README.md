# 5 Vidas - El Juego de Cartas Online 🃏✨

**5 Vidas** es un emocionante juego de cartas multijugador en tiempo real diseñado para jugarse directamente desde el navegador. Inspirado en clásicos juegos de bazas, el objetivo es simple pero desafiante: predecir cuántas manos ganarás y ser el último jugador con vidas en pie.

![Demo del Juego](https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=1000) *(Imagen ilustrativa de ambiente de juego)*

## ✨ Características Principales

- 🎮 **Multijugador en Tiempo Real**: Crea una mesa y comparte el enlace con tus amigos para jugar al instante.
- 🤖 **Bots Inteligentes**: ¿Te falta gente? Añade bots a la partida para completar la mesa.
- 💬 **Chat Integrado**: Comunícate con tus oponentes durante la partida para añadirle picante al juego.
- 🌓 **Diseño Moderno y Fluido**: Interfaz oscura premium con animaciones suaves gracias a Framer Motion y Tailwind CSS.
- 📱 **Responsive**: Totalmente jugable desde dispositivos móviles o PC.
- 🕶️ **Modo Ciego**: En la primera ronda, ¡jugarás sin ver tu propia carta!

## 🚀 Tecnologías Utilizadas

Este proyecto utiliza un stack moderno para garantizar una experiencia de usuario rápida y sincronizada:

- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Estilos y Animaciones**: [Tailwind CSS](https://tailwindcss.com/) + [Framer Motion](https://www.framer.com/motion/)
- **Backend & Database**: [Supabase](https://supabase.com/) (Realtime, Auth y PostgreSQL)
- **Iconos**: [Lucide React](https://lucide.dev/)
- **API**: Serverless functions preparadas para entornos como Vercel.

## 📜 Reglas del Juego

### El Objetivo
Cada jugador comienza con **5 Corazones (vidas)**. El último jugador que conserve al menos una vida gana la partida.

### Dinámica de las Rondas
1. **Reparto**: Al inicio de cada ronda se reparten cartas. El número de cartas va disminuyendo: empezamos con 5 (o según el número de jugadores), luego 4, 3, 2 hasta llegar a la ronda crítica de **1 carta**.
2. **Apuestas (Bidding)**: Tras ver tus cartas, debes predecir cuántas **bazas** (manos) crees que ganarás en esa ronda.
3. **La Regla del Último (The Rule of 1)**: El último jugador en apostar tiene una restricción: la suma total de las apuestas de la mesa **no puede ser igual** al número de cartas repartidas. Esto garantiza que al menos un jugador perderá vidas esa ronda.
4. **Modo Ciego**: En la ronda de 1 carta, no ves tu carta pero sí las de los demás. ¡Adivina basándote en lo que ves!

### Puntuación
Al final de la ronda, se compara tu apuesta con las bazas que realmente ganaste.
- Perderás **vidas iguales a la diferencia** entre tu apuesta y tu resultado.
- *Ejemplo: Apostaste 2 pero ganaste 0 bazas -> Pierdes 2 vidas.*
- *Ejemplo: Apostaste 1 y ganaste 1 baza -> No pierdes vidas.*

## 🛠️ Instalación y Configuración Local

Si quieres montar el proyecto en tu entorno local, sigue estos pasos:

### Prerrequisitos
- [Node.js](https://nodejs.org/) (v18 o superior recomendado)
- Una cuenta en [Supabase](https://supabase.com/) para la base de datos.

### Pasos
1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/tu-usuario/web-5vidas.git
   cd web-5vidas
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**:
   Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:
   ```env
   VITE_SUPABASE_URL=tu_url_de_supabase
   VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
   SUPABASE_URL=tu_url_de_supabase
   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
   ```

4. **Preparar la Base de Datos**:
   Ejecuta el script SQL que se encuentra en `supabase/schema.sql` en el editor SQL de tu panel de Supabase para crear las tablas y políticas necesarias.

5. **Ejecutar el proyecto**:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

---

Creado con ❤️ por **Juanjo_xrd**.
