import React from 'react';

export const DocsView: React.FC = () => {
  return (
    <div
      className="flex-1 relative overflow-hidden bg-transparent flex items-center justify-center min-h-full w-full select-none"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(250, 250, 250, 0.02) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(250, 250, 250, 0.02) 1px, transparent 1px),
          linear-gradient(to right, rgba(250, 250, 250, 0.02) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(250, 250, 250, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '24px 24px, 24px 24px, 96px 96px, 96px 96px',
        backgroundPosition: '-1px -1px'
      }}
    >
      {/* Centered Coming Soon text */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center p-8">
        <h1 className="text-2xl md:text-3xl font-karla font-semibold text-text-primary tracking-tight">
          Coming Soon
        </h1>
      </div>
    </div>
  );
};
