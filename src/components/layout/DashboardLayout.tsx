import React from 'react';
import { Sidebar } from './Sidebar';

interface Props {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<Props> = ({ children }) => {
  return (
    <div className="layout-grid relative min-h-screen bg-[#030303]">
      <div className="bg-glow" />
      
      <Sidebar />
      
      <main className="min-h-screen p-8 transition-all relative z-10 min-w-0 overflow-x-hidden">
        <header className="flex items-center justify-between mb-12">
          <div>
             <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Welcome Back, Alex!</h2>
             <p className="text-sm text-gray-subtext">Your AI agents summarized 4,502 social signals today.</p>
          </div>
          <div className="flex items-center gap-4">
             <button className="flex items-center gap-2 px-6 py-2 bg-primary-blue text-white font-bold rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:scale-105 transition-all">
                <span className="material-symbols-outlined text-sm">add</span>
                Create New Post
             </button>
             <div className="flex items-center justify-center w-10 h-10 border border-dark-border rounded-xl cursor-default hover:bg-white/5 transition-all">
                <span className="material-symbols-outlined text-gray-400">notifications</span>
             </div>
          </div>
        </header>

        <section className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
          {children}
        </section>
      </main>
    </div>
  );
};
