import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as Icons from 'lucide-react';

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  className?: string;
}

const COMMON_ICONS = [
  'Hexagon', 'Box', 'Layers', 'Code', 'Database', 'Server', 'Terminal', 'Cpu',
  'Layout', 'Monitor', 'Smartphone', 'Globe', 'Cloud', 'Lock', 'Shield', 'Key',
  'Briefcase', 'Building', 'Map', 'Compass', 'Target', 'Flag', 'Star', 'Heart',
  'Zap', 'Flame', 'Droplet', 'Wind', 'Sun', 'Moon', 'CloudRain', 'Snowflake',
  'Music', 'Video', 'Camera', 'Image', 'Book', 'File', 'FileText', 'Folder',
  'Users', 'User', 'MessageSquare', 'MessageCircle', 'Mail', 'Phone', 'Bell',
  'Activity', 'HeartPulse', 'Smile', 'Coffee', 'Package', 'Truck', 'ShoppingCart',
  'Tool', 'Wrench', 'Hammer', 'Settings', 'Sliders', 'ToggleLeft', 'ToggleRight',
  'CheckCircle', 'AlertCircle', 'Info', 'HelpCircle', 'PieChart', 'BarChart',
  'TrendingUp', 'TrendingDown', 'List', 'Grid', 'Hash', 'AtSign', 'Link',
  'Search', 'Command', 'PenTool', 'Edit', 'Paperclip', 'Scissors', 'Bookmark'
];

export const IconPicker: React.FC<IconPickerProps> = ({ value, onChange, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return COMMON_ICONS;
    const q = search.toLowerCase();
    return COMMON_ICONS.filter(icon => icon.toLowerCase().includes(q));
  }, [search]);

  // @ts-ignore
  const SelectedIcon = Icons[value] || Icons.Hexagon;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-lg bg-bg-surface-raised border border-transparent flex items-center justify-center text-text-primary hover:border-accent-primary hover:ring-1 hover:ring-accent-primary/50 transition-colors focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
      >
        <SelectedIcon className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1.5 left-0 w-64 bg-bg-surface-raised border border-transparent rounded-lg shadow-lg z-50 p-2 font-sans overflow-hidden flex flex-col">
          <div className="relative mb-2">
            <Icons.Search className="w-3.5 h-3.5 text-text-tertiary absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search icons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-bg-surface-raised border border-transparent rounded-full text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
            />
          </div>
          
          <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto p-1">
            {filteredIcons.length === 0 ? (
              <div className="col-span-6 text-center text-xs text-text-secondary py-4">
                No icons found.
              </div>
            ) : (
              filteredIcons.map((iconName) => {
                // @ts-ignore
                const IconComponent = Icons[iconName];
                if (!IconComponent) return null;
                const isSelected = value === iconName;
                
                return (
                  <button
                    key={iconName}
                    type="button"
                    title={iconName}
                    onClick={() => {
                      onChange(iconName);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-8 h-8 rounded-sm flex items-center justify-center transition-colors ${
                      isSelected 
                        ? 'bg-accent-primary/10 text-accent-primary border border-transparent' 
                        : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary border border-transparent'
                    }`}
                  >
                    <IconComponent className="w-4 h-4" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
