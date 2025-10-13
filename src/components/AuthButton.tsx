import React from 'react';
import { cn } from '../lib/utils';

interface AuthButtonProps {
  provider: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

const providerStyles: Record<string, string> = {
  google: 'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white',
  facebook: 'bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white',
  apple: 'bg-gradient-to-br from-gray-900 to-black hover:from-black hover:to-gray-900 text-white',
  github: 'bg-gradient-to-br from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black text-white',
  microsoft: 'bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 text-white',
  kakao: 'bg-gradient-to-br from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-gray-900',
  naver: 'bg-gradient-to-br from-green-400 to-green-500 hover:from-green-500 hover:to-green-600 text-white',
  line: 'bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white',
  email: 'bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white',
  passkey: 'bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white',
};

export function AuthButton({ provider, icon, onClick, className, children }: AuthButtonProps) {
  const baseStyles = 'w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg';
  const providerStyle = providerStyles[provider.toLowerCase()] || 'bg-gray-700 hover:bg-gray-800 text-white';

  return (
    <button
      onClick={onClick}
      className={cn(baseStyles, providerStyle, className)}
    >
      {icon && <span className="auth-icon w-4 h-4 shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
