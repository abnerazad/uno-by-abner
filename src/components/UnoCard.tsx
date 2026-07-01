import React from 'react';
import { cn } from '../lib/utils';
import { Card, CardColor } from '../types';

interface UnoCardProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  isBack?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const colorMap: Record<CardColor, string> = {
  red: 'bg-uno-red',
  green: 'bg-uno-green',
  blue: 'bg-uno-blue',
  yellow: 'bg-uno-yellow',
  wild: 'bg-uno-wild',
};

const colorHexMap: Record<CardColor, string> = {
  red: '#e53946',
  green: '#0bda51',
  blue: '#00a4d1',
  yellow: '#fce84c',
  wild: '#24282c',
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
          'uno-card bg-uno-wild flex items-center justify-center shadow-xl relative overflow-hidden',
          className
        )}
      >
        <div className="uno-oval-container">
          <div className="uno-oval">
            <div className="uno-text">UNO</div>
          </div>
        </div>
        <div className="uno-color-bar">
          <div className="cb-blue" />
          <div className="cb-red" />
          <div className="cb-yellow" />
          <div className="cb-green" />
        </div>
      </div>
    );
  }

  const renderCornerValue = () => {
    switch (card.value) {
      case 'skip':
        return <div className="uno-skip-icon corner-size" />;
      case 'reverse':
        return (
          <svg className="uno-reverse-icon" viewBox="0 0 100 100">
            <path d="M53.1 5.7 59.5 13.4 36.5 32.7C28.8 39.1 27.6 53.2 34 60.9L72.4 28.7 78.8 36.4 85 6 53.1 5.7Z" />
            <path d="M46.9 93.3l-6.4-7.7L63.5 66.3c7.7-6.4 8.9-20.5 2.5-28.2L27.6 70.3l-6.4-7.7-6.2 30.4L46.9 93.3Z" />
          </svg>
        );
      case 'draw2':
        return '+2';
      case 'draw4':
        return '+4';
      case 'wild':
        return <div className="uno-wild-circle corner-size" />;
      default:
        return card.value;
    }
  };

  const renderBRCornerValue = () => {
    if (card.value >= '0' && card.value <= '9') {
      return <span className="uno-underline">{card.value}</span>;
    }
    return renderCornerValue();
  };

  const renderCenterElement = () => {
    switch (card.value) {
      case 'skip':
        return <div className="uno-skip-icon center-size" />;
      case 'reverse':
        return (
          <div className="uno-center-size-svg">
            <svg className="uno-reverse-icon" viewBox="0 0 100 100">
              <path d="M53.1 5.7 59.5 13.4 36.5 32.7C28.8 39.1 27.6 53.2 34 60.9L72.4 28.7 78.8 36.4 85 6 53.1 5.7Z" />
              <path d="M46.9 93.3l-6.4-7.7L63.5 66.3c7.7-6.4 8.9-20.5 2.5-28.2L27.6 70.3l-6.4-7.7-6.2 30.4L46.9 93.3Z" />
            </svg>
          </div>
        );
      case 'draw2': {
        const cardColor = card.color || 'blue';
        const bgColor = colorHexMap[cardColor];
        return (
          <div className="uno-draw2-center">
            <div className="uno-d2-box uno-d2-bottom" style={{ backgroundColor: bgColor }} />
            <div className="uno-d2-box uno-d2-top" style={{ backgroundColor: bgColor }} />
          </div>
        );
      }
      case 'draw4':
        return (
          <div className="uno-draw4-center">
            <div className="uno-d4-box uno-d4-green" />
            <div className="uno-d4-box uno-d4-blue" />
            <div className="uno-d4-box uno-d4-red" />
            <div className="uno-d4-box uno-d4-yellow" />
          </div>
        );
      case 'wild':
        return <div className="uno-wild-circle center-size" />;
      default:
        return <div className="uno-center-number">{card.value}</div>;
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        sizeClasses[size],
        'uno-card relative flex items-center justify-center shadow-2xl transition-all duration-200 overflow-hidden',
        colorMap[card.color],
        !disabled && 'hover:-translate-y-4 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] cursor-pointer',
        disabled && 'brightness-85',
        className
      )}
    >
      {/* Corner values */}
      <div className="uno-corner tl">
        {renderCornerValue()}
      </div>
      <div className="uno-corner br">
        {renderBRCornerValue()}
      </div>

      {/* Center element */}
      {renderCenterElement()}
    </button>
  );
};
