import React from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

const menuItems = [
  { icon: 'dashboard', label: 'Dashboard', path: '/' },
  { icon: 'analytics', label: 'Analytics', path: '/analytics' },
  { icon: 'schedule', label: 'Scheduler', path: '/scheduler' },
  { icon: 'psychology', label: 'AI Predictor', path: '/predictor' },
  { icon: 'settings', label: 'Settings', path: '/settings' },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();

  return (
    <aside className="glass border-r h-full flex flex-col p-6 z-50">
      <div className="flex items-center gap-3 mb-12 px-2">
        <div className="w-10 h-10 bg-primary-blue rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
          <span className="material-symbols-outlined text-white">rocket_launch</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
          SocialFlow AI
        </h1>
      </div>

      <nav className="flex-1 space-y-2">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
          <motion.div
            key={item.label}
            whileHover={{ x: 4 }}
            className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all ${
              isActive
              ? 'bg-primary-blue/20 text-primary-blue border border-primary-blue/30' 
              : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="text-sm font-semibold tracking-wide">
              {item.label}
            </span>
            {isActive && (
              <motion.div 
                layoutId="active-pill"
                className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-blue shadow-[0_0_10px_rgba(59,130,246,1)]" 
              />
            )}
          </motion.div>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-dark-border pt-6 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-0.5">
            <div className="w-full h-full rounded-full bg-dark-bg flex items-center justify-center overflow-hidden">
               <span className="material-symbols-outlined text-xs">person</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-white">Alex Morgan</p>
            <p className="text-[10px] text-gray-subtext uppercase tracking-widest font-bold">Pro Plan</p>
          </div>
          <span className="material-symbols-outlined ml-auto text-gray-400 cursor-pointer hover:text-white">logout</span>
        </div>
      </div>
    </aside>
  );
};
