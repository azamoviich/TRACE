import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', style, title, subtitle, action, onClick }) => {
  return (
    <div
      className={`glass rounded-3xl p-5 ${onClick ? 'cursor-pointer glass-hover' : ''} transition-colors ${className}`}
      style={style}
      onClick={onClick}
    >
      {(title || action) && (
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-[15px] font-semibold text-text tracking-tight leading-none">{title}</h3>
            {subtitle && <p className="text-[13px] text-muted mt-1">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};
