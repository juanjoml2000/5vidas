# Guía de Configuración: 5 Vidas en Supabase

Sigue estos pasos para que tu juego esté online en minutos:

## 1. Supabase (Base de Datos y Realtime)
1. Ve a [Supabase](https://supabase.com/) y crea un nuevo proyecto.
2. Abre el **SQL Editor** en tu panel de Supabase.
3. Copia el contenido de `supabase/schema.sql` (en este proyecto) y ejecútalo. Esto creará las tablas y habilitará el tiempo real.
4. Ve a **Project Settings > API** y copia:
   - `Project URL` (será tu `SUPABASE_URL`)
   - `anon public` key (será tu `SUPABASE_ANON_KEY`)
   - `service_role` key (será tu `SUPABASE_SERVICE_ROLE_KEY` - **No compartas esta nunca**).

## 2. Vercel (Despliegue)
1. Sube este código a un repositorio de GitHub.
2. En [Vercel](https://vercel.com/), importa el repositorio.
3. En la sección **Environment Variables**, añade las siguientes:
   - `VITE_SUPABASE_URL`: Tu URL de Supabase.
   - `VITE_SUPABASE_ANON_KEY`: Tu Anon Key.
   - `SUPABASE_URL`: Tu URL de Supabase (igual que la anterior).
   - `SUPABASE_SERVICE_ROLE_KEY`: Tu Service Role Key.
4. Haz clic en **Deploy**.

## 3. Acceso
- Una vez desplegado, Vercel te dará una URL (ej. `web-5vidas.vercel.app`).
- Pásale esa URL a tu amigo.
- ¡A jugar! La partida se sincronizará automáticamente para ambos.
