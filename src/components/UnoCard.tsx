import React from 'react';
import { cn } from '../lib/utils';
import { Card, CardColor } from '../types';
import { SkipForward, RefreshCw, Plus, Zap } from 'lucide-react';

interface UnoCardProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  isBack?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const colorMap: Record<CardColor, string> = {
  red: 'bg-red-600',
  green: 'bg-green-600',
  blue: 'bg-blue-600',
  yellow: 'bg-yellow-400',
  wild: 'bg-zinc-900',
};

const textColorMap: Record<CardColor, string> = {
  red: 'text-red-100',
  green: 'text-green-100',
  blue: 'text-blue-100',
  yellow: 'text-yellow-900',
  wild: 'text-zinc-100',
};

export const UnoCard: React.FC<UnoCardProps> = ({
  card,
  onClick,
  disabled,
  className,
  isBack,
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'w-10 h-14 md:w-14 md:h-20 text-[8px] md:text-[10px]',
    md: 'w-16 h-24 sm:w-20 sm:h-32 md:w-28 md:h-44 text-xs md:text-sm',
    lg: 'w-24 h-36 md:w-36 md:h-56 text-base md:text-lg',
  };

  if (isBack) {
    return (
      <div
        className={cn(
          sizeClasses[size],
          'bg-zinc-900 border-[6px] border-white rounded-xl flex items-center justify-center shadow-xl relative overflow-hidden',
          className
        )}
      >
        {/* Diagonal stripes pattern */}
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(45deg, #fff 25%, transparent 25%, transparent 50%, #fff 50%, #fff 75%, transparent 75%, transparent)', backgroundSize: '10px 10px' }} />
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-full aspect-square bg-white/10 rounded-full flex items-center justify-center rotate-12">
            <div className="bg-white p-1 rounded-sm rotate-45 mb-1">
              <div className="grid grid-cols-2 gap-0.5">
                <div className="w-2 h-2 bg-red-600" />
                <div className="w-2 h-2 bg-blue-600" />
                <div className="w-2 h-2 bg-yellow-400" />
                <div className="w-2 h-2 bg-green-600" />
              </div>
            </div>
          </div>
          <span className="text-white font-black italic text-xl tracking-tighter mt-2">COLORS</span>
        </div>

        {/* Corner text */}
        <div className="absolute top-1 left-2 text-[8px] font-bold text-white/40 uppercase rotate-45">COLORS</div>
        <div className="absolute bottom-1 right-2 text-[8px] font-bold text-white/40 uppercase rotate-[225deg]">COLORS</div>
      </div>
    );
  }

  const renderValue = (isLarge = false) => {
    const iconSize = isLarge ? (size === 'lg' ? 48 : 32) : 16;
    
    switch (card.value) {
      case 'skip':
        return <div className="rounded-full border-4 border-current w-10 h-10 flex items-center justify-center"><div className="w-full h-1 bg-current rotate-45" /></div>;
      case 'reverse':
        return <RefreshCw size={iconSize} strokeWidth={3} />;
      case 'draw2':
        return <div className="flex flex-col items-center leading-none"><span className="font-black text-2xl">+2</span></div>;
      case 'draw4':
        return (
          <div className="flex flex-col items-center">
             <span className={cn("font-black italic leading-none", isLarge ? "text-6xl" : "text-lg")}>+4</span>
          </div>
        );
      case 'wild':
        return (
          <div className="flex flex-col items-center">
            <div className="grid grid-cols-2 gap-0.5 bg-zinc-900 p-0.5 rounded-sm mb-1">
              <div className="w-2 h-2 md:w-4 md:h-4 bg-red-600" />
              <div className="w-2 h-2 md:w-4 md:h-4 bg-blue-600" />
              <div className="w-2 h-2 md:w-4 md:h-4 bg-yellow-400" />
              <div className="w-2 h-2 md:w-4 md:h-4 bg-green-600" />
            </div>
            <span className="text-[8px] md:text-[10px] font-black italic tracking-tighter">COLOR</span>
          </div>
        );
      default:
        return <span className={cn("font-black italic leading-none", isLarge ? "text-6xl" : "text-lg")}>{card.value}</span>;
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        sizeClasses[size],
        colorMap[card.color],
        textColorMap[card.color],
        'border-[6px] border-white rounded-xl relative flex items-center justify-center shadow-2xl transition-all duration-200 overflow-hidden',
        !disabled && 'hover:-translate-y-4 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] cursor-pointer',
        disabled && 'opacity-90',
        className
      )}
    >
      {/* Background stripes */}
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(45deg, #000 25%, transparent 25%, transparent 50%, #000 50%, #000 75%, transparent 75%, transparent)', backgroundSize: '8px 8px' }} />

      {/* Corner values */}
      <div className="absolute top-1 left-2 font-black flex flex-col items-center">
        {renderValue(false)}
      </div>
      <div className="absolute bottom-1 right-2 font-black flex flex-col items-center rotate-180">
        {renderValue(false)}
      </div>

      {/* Center Diamond */}
      <div className="w-[75%] aspect-square bg-white rounded-lg rotate-45 flex items-center justify-center shadow-inner">
        <div className="-rotate-45 flex items-center justify-center w-full h-full text-zinc-900">
          {renderValue(true)}
        </div>
      </div>
    </button>
  );
};
