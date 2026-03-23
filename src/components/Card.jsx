import React from 'react';
import { motion } from 'framer-motion';

const SUITS = {
  oros: { icon: '🟡', color: 'text-yellow-400', label: 'Oros' },
  copas: { icon: '🍷', color: 'text-red-400', label: 'Copas' },
  espadas: { icon: '⚔️', color: 'text-blue-400', label: 'Espadas' },
  bastos: { icon: '🌳', color: 'text-green-400', label: 'Bastos' },
};

const VALUES = {
  1: 'As',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  10: 'Sota',
  11: 'Caballo',
  12: 'Rey',
};

export default function Card({ card, onClick, disabled, isSelected, isFaceDown, isBlind }) {
  if (isFaceDown) {
    return (
      <div className="w-24 h-36 md:w-32 md:h-48 bg-red-900 rounded-xl border-4 border-red-700 shadow-2xl flex items-center justify-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-800 to-red-950 opacity-50" />
        <div className="relative text-red-700 font-black text-4xl transform -rotate-12 transition-transform group-hover:rotate-0">5</div>
      </div>
    );
  }

  const { suit, value } = card;
  const suitData = SUITS[suit];

  return (
    <motion.button
      whileHover={!disabled ? { y: -10, scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={onClick}
      disabled={disabled}
      className={`
        relative w-24 h-36 md:w-32 md:h-48 rounded-2xl flex flex-col items-center justify-between p-3 md:p-4
        ${isSelected ? 'ring-4 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]' : 'shadow-xl'}
        ${disabled && !isSelected ? 'opacity-40 grayscale pointer-events-none' : 'cursor-pointer'}
        bg-white/95 backdrop-blur-sm border-2 border-white transition-all
      `}
    >
      {/* Corner indicators */}
      <div className="absolute top-2 left-2 text-left">
        <div className={`text-lg md:text-xl font-bold ${suitData.color} leading-none`}>
          {value === 10 || value === 11 || value === 12 ? VALUES[value][0] : value}
        </div>
        <div className="text-xs md:text-sm">{suitData.icon}</div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1">
        <span className="text-3xl md:text-5xl drop-shadow-sm">{suitData.icon}</span>
        {isBlind ? (
          <span className="text-[10px] md:text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-tighter">
            Ronda Ciega
          </span>
        ) : (
          <span className={`text-xs md:text-sm font-black uppercase tracking-tight ${suitData.color}`}>
            {VALUES[value]}
          </span>
        )}
      </div>

      {/* Bottom corner */}
      <div className="absolute bottom-2 right-2 flex flex-col items-end rotate-180">
        <div className={`text-lg md:text-xl font-bold ${suitData.color} leading-none`}>
          {value === 10 || value === 11 || value === 12 ? VALUES[value][0] : value}
        </div>
        <div className="text-xs md:text-sm">{suitData.icon}</div>
      </div>
    </motion.button>
  );
}
