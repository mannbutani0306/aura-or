import React, { useState, useEffect, useRef } from 'react';
import { IconSearch } from './icons';
import { Kbd } from './Kbd';

export interface CommandItem {
  id: string;
  category: 'Navigation' | 'Action';
  label: string;
  description?: string;
  shortcut?: string;
  icon?: string;
  perform: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandItem[];
}

export function CommandPalette({ isOpen, onClose, items }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredItems = items.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].perform();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center pt-20 px-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-150"
      />

      {/* Palette Slip */}
      <div
        className="relative w-full max-w-lg bg-[var(--surface-raised)] border-2 border-[var(--line)] rounded-[20px] shadow-[8px_8px_0_var(--shadow-ink)] overflow-hidden flex flex-col animate-stamp-down"
        style={{ animationTimingFunction: 'var(--ease-aura)' }}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b-2 border-[var(--line)] bg-[var(--surface)]/70">
          <IconSearch size={16} className="text-[var(--ink)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm font-ui font-medium text-[var(--ink)] placeholder-[var(--ink-muted)] outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto p-2.5 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono-numbers text-[var(--ink-muted)] font-bold">
              No matching commands
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.perform();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-[12px] text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--ink)] text-[var(--bg-app)] shadow-[2px_2px_0_var(--signal)]'
                      : 'text-[var(--ink)] hover:bg-[var(--surface)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.icon && <span className="text-base">{item.icon}</span>}
                    <div className="flex flex-col">
                      <span className="font-ui font-semibold leading-none">{item.label}</span>
                      {item.description && (
                        <span
                          className={`text-[10px] mt-1 font-mono-numbers ${
                            isSelected ? 'opacity-80' : 'text-[var(--ink-muted)]'
                          }`}
                        >
                          {item.description}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-mono-numbers uppercase tracking-wider font-bold ${
                        isSelected ? 'opacity-80' : 'text-[var(--ink-muted)]'
                      }`}
                    >
                      {item.category}
                    </span>
                    {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
