import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper to merge tailwind classes
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const suitSymbols = {
  oros: '🟡',
  copas: '🍷',
  espadas: '⚔️',
  bastos: '🪵'
};

const suitColors = {
  oros: 'text-amber-500',
  copas: 'text-rose-500',
  espadas: 'text-sky-500',
  bastos: 'text-emerald-700'
};

export function Card({ 
    suit, 
    value, 
    faceUp = true, 
    onClick, 
    disabled = false, 
    isSelected = false,
    isBlind = false, // Round 1 rule: don't see your own card
    className 
}) {
  return (
    <motion.div
      whileHover={faceUp && !disabled ? { y: -10, scale: 1.05 } : {}}
      whileTap={faceUp && !disabled ? { scale: 0.95 } : {}}
      onClick={!disabled ? onClick : undefined}
      className={cn(
        "game-card transition-shadow duration-300",
        faceUp ? "card-face-up" : "card-face-down",
        isSelected && "ring-4 ring-game-accent shadow-sky-500/50 -translate-y-4",
        disabled && "opacity-50 grayscale cursor-default",
        className
      )}
    >
      {faceUp ? (
        <>
          <div className={cn("text-xl font-bold self-start", suitColors[suit])}>
            {value === 10 ? 'Sota' : value === 11 ? 'Caballo' : value === 12 ? 'Rey' : value}
          </div>
          <div className="text-4xl">
            {isBlind ? '❓' : suitSymbols[suit]}
          </div>
          <div className={cn("text-xl font-bold self-end rotate-180", suitColors[suit])}>
            {value === 10 ? 'S' : value === 11 ? 'C' : value === 12 ? 'R' : value}
          </div>
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
            <div className="text-3xl opacity-20">🎴</div>
        </div>
      )}
    </motion.div>
  );
}
