import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, UserPlus, Mail, Lock, Loader2, Save, UserCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
   const [isUpdatePassword, setIsUpdatePassword] = useState(false);
  const [showGuestNick, setShowGuestNick] = useState(false);
  const [guestNick, setGuestNick] = useState('');

  React.useEffect(() => {
    // Also check hash directly on mount for robustness
    if (window.location.hash.includes('type=recovery')) {
      setIsUpdatePassword(true);
    }
    
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setIsUpdatePassword(true);
    });
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage('¡Registro con éxito! Revisa tu email para confirmar tu cuenta.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Credenciales inválidas' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('Introduce tu email para restablecer la contraseña');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) setError(error.message);
    else setMessage('Se ha enviado un correo para restablecer tu contraseña');
    setLoading(false);
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!password) {
        setError('Introduce una nueva contraseña');
        return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else {
        setMessage('¡Contraseña actualizada! Ya puedes jugar.');
        setTimeout(() => setIsUpdatePassword(false), 2000);
    }
    setLoading(false);
  };

  const handleAnonymous = async (e) => {
    if (e) e.preventDefault();
    if (!guestNick.trim()) {
      setShowGuestNick(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data: { user }, error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) throw signInError;
      
      if (user) {
        const { error: updateError } = await supabase.auth.updateUser({
          data: { display_name: guestNick.trim() }
        });
        if (updateError) throw updateError;
      }
    } catch (err) {
      setError(err.message.includes('not enabled') ? 'El administrador debe activar el "Inicio de sesión anónimo" en Supabase.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 shadow-2xl overflow-hidden relative"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-red-500" />
        
        <div className="text-center mb-8">
          <div className="flex items-center gap-3 justify-center mb-4">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/40"><span className="text-xl font-black italic text-white">5</span></div>
            <span className="text-xl font-black tracking-tighter uppercase text-white">5 VIDAS</span>
          </div>
          <p className="text-red-200 font-medium">
            {isUpdatePassword ? 'Establece tu nueva contraseña' : isSignUp ? 'Crea tu cuenta para jugar' : 'Inicia sesión para entrar al juego'}
          </p>
        </div>

        <form onSubmit={isUpdatePassword ? handleUpdatePassword : handleAuth} className="space-y-4">
          {!isUpdatePassword && (
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-300 group-focus-within:text-white transition-colors" />
              <input
                type="email"
                placeholder="Email"
                className="w-full bg-black/20 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-red-300/50 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all text-lg"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          )}

          <div className="relative group">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-300 group-focus-within:text-white transition-colors" />
            <input
              type="password"
              placeholder={isUpdatePassword ? "Nueva Contraseña" : "Contraseña"}
              className="w-full bg-black/20 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-red-300/50 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all text-lg"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isSignUp || isUpdatePassword}
            />
          </div>

          {!isSignUp && !isUpdatePassword && (
            <div className="text-right">
              <button 
                type="button"
                onClick={handleResetPassword}
                className="text-[10px] uppercase font-black text-red-400 hover:text-white transition-colors tracking-widest"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl text-sm font-medium"
              >
                {error}
              </motion.div>
            )}
            {message && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-green-500/20 border border-green-500/50 text-green-200 px-4 py-3 rounded-xl text-sm font-medium"
              >
                {message}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-900/40 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xl mt-4"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isUpdatePassword ? (
               <>
                 <Save className="w-6 h-6" />
                 Guardar Contraseña
               </>
            ) : isSignUp ? (
              <>
                <UserPlus className="w-6 h-6" />
                Registrarse
              </>
            ) : (
              <>
                <LogIn className="w-6 h-6" />
                Entrar
              </>
            )}
          </button>

          {!isUpdatePassword && (
            <div className="space-y-4">
              <AnimatePresence>
                {showGuestNick && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="relative group">
                      <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-400" />
                      <input 
                        autoFocus
                        type="text"
                        placeholder="Tu Nickname..."
                        className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-lg"
                        value={guestNick}
                        onChange={(e) => setGuestNick(e.target.value)}
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={handleAnonymous}
                      disabled={loading || !guestNick.trim()}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl mt-3 transition-all flex items-center justify-center gap-2"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar Nickname'}
                    </button>
                    <div className="h-4" />
                  </motion.div>
                )}
              </AnimatePresence>
              
              {!showGuestNick && (
                <button
                  type="button"
                  onClick={() => setShowGuestNick(true)}
                  disabled={loading}
                  className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-2xl border border-white/10 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-lg"
                >
                  <UserCircle className="w-5 h-5 opacity-70" />
                  Jugar como Invitado
                </button>
              )}
            </div>
          )}
        </form>

        {!isUpdatePassword && (
          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-red-200/70 mb-2">
              {isSignUp ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}
            </p>
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setMessage(null);
              }}
              className="text-white font-bold hover:text-red-300 transition-colors text-lg underline underline-offset-4 decoration-red-500/50"
            >
              {isSignUp ? 'Inicia Sesión' : 'Crea una cuenta ahora'}
            </button>
          </div>
        )}
      </motion.div>
      
      <p className="mt-8 text-red-200/50 text-sm font-medium flex flex-col items-center gap-1">
        <span>© 2026 5 VIDAS - Juego de Cartas</span>
        <span className="text-red-500/80 font-black tracking-widest uppercase text-[10px]">Creado por Juanjo_xrd</span>
      </p>
    </div>
  );
}
