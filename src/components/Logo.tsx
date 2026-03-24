import React from 'react';

export const Logo = ({ className = "h-20 w-auto" }: { className?: string }) => {
  return (
    <img 
      src="https://lh3.googleusercontent.com/d/1IuPrWVZ3iOJsGRjVDG6s06n0dE0cD9IG" 
      alt="iTechSA Logo" 
      className={className}
      referrerPolicy="no-referrer"
    />
  );
};
