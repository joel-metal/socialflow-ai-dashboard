import React from 'react';

interface StatBadgeProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'blue' | 'teal' | 'purple' | 'yellow' | 'red';
}

export const StatBadge: React.FC<StatBadgeProps> = ({ 
  label, 
  value, 
  icon, 
  trend = 'neutral', 
  color = 'blue' 
}) => {
  const colorMap = {
    blue: 'from-blue-500/20 to-blue-600/5 text-blue-400 border-blue-500/20',
    teal: 'from-teal-500/20 to-teal-600/5 text-teal-400 border-teal-500/20',
    purple: 'from-purple-500/20 to-purple-600/5 text-purple-400 border-purple-500/20',
    yellow: 'from-yellow-500/20 to-yellow-600/5 text-yellow-400 border-yellow-500/20',
    red: 'from-red-500/20 to-red-600/5 text-red-400 border-red-500/20',
  };

  return (
    <div className={`flex flex-col items-center justify-center p-4 rounded-xl border bg-gradient-to-br ${colorMap[color]} backdrop-blur-sm transition-all hover:scale-105 active:scale-95 cursor-default`}>
      <span className="material-symbols-outlined text-3xl mb-2 opacity-80">{icon}</span>
      <p className="text-2xl font-bold tracking-tight glow-text">{value}</p>
      <p className="text-[10px] uppercase font-bold tracking-widest opacity-60 mt-1">{label}</p>
      
      {trend !== 'neutral' && (
        <div className={`mt-2 flex items-center gap-1 text-[10px] font-bold ${trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
          <span className="material-symbols-outlined text-xs">
            {trend === 'up' ? 'trending_up' : 'trending_down'}
          </span>
          {trend === 'up' ? '+12.5%' : '-3.2%'}
        </div>
      )}
    </div>
  );
};
