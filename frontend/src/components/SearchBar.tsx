import { useState, useRef, useEffect } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

function SearchBar({ value, onChange }: SearchBarProps) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  return (
    <div className="relative">
      {expanded ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search…"
            className="w-full bg-mv-surface border border-mv-border rounded-lg px-3 py-1.5 text-sm text-mv-text placeholder:text-mv-text-muted outline-none focus:border-mv-accent transition-colors"
            onBlur={() => {
              if (!value) setExpanded(false);
            }}
          />
          <button
            onClick={() => {
              onChange('');
              setExpanded(false);
            }}
            className="text-mv-text-secondary hover:text-mv-text text-sm shrink-0"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-mv-text-secondary hover:bg-mv-hover hover:text-mv-text transition-colors"
        >
          🔍
        </button>
      )}
    </div>
  );
}

export default SearchBar;
