"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";

export type LookupItem = { id: string; label: string; sublabel?: string };

interface EntityComboboxProps {
  value: string | null;
  onChange: (id: string | null) => void;
  search: (q: string) => Promise<LookupItem[]>;
  getById: (id: string) => Promise<LookupItem | null>;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

export function EntityCombobox({
  value,
  onChange,
  search,
  getById,
  placeholder = "Search…",
  emptyMessage = "No results",
  disabled,
}: EntityComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LookupItem | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!value) {
      setSelectedItem(null);
      return;
    }
    if (selectedItem?.id === value) return;
    let cancelled = false;
    getById(value).then((it) => {
      if (!cancelled) setSelectedItem(it);
    });
    return () => {
      cancelled = true;
    };
  }, [value, getById, selectedItem?.id]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await search(query);
        setItems(results);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, search]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function handleSelect(item: LookupItem) {
    onChange(item.id);
    setSelectedItem(item);
    setOpen(false);
    setQuery("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setSelectedItem(null);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-left disabled:opacity-50"
      >
        <span className={selectedItem ? "truncate" : "text-muted-foreground"}>
          {selectedItem?.label ?? placeholder}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ms-2">
          {selectedItem && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={14} className="text-muted-foreground" />
        </div>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg">
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search…"
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="w-full text-left px-2 py-2 text-sm rounded hover:bg-muted/60 flex items-start justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{item.label}</div>
                    {item.sublabel && (
                      <div className="text-xs text-muted-foreground truncate">{item.sublabel}</div>
                    )}
                  </div>
                  {value === item.id && (
                    <Check size={14} className="text-primary shrink-0 mt-1" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface EntityMultiComboboxProps {
  values: string[];
  onChange: (ids: string[]) => void;
  search: (q: string) => Promise<LookupItem[]>;
  getById: (id: string) => Promise<LookupItem | null>;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

export function EntityMultiCombobox({
  values,
  onChange,
  search,
  getById,
  placeholder = "Search to add…",
  emptyMessage = "No results",
  disabled,
}: EntityMultiComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<Map<string, LookupItem>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const missing = values.filter((v) => !resolved.has(v));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((id) => getById(id).then((it) => [id, it] as const))).then(
      (pairs) => {
        if (cancelled) return;
        setResolved((prev) => {
          const next = new Map(prev);
          for (const [id, it] of pairs) {
            if (it) next.set(id, it);
          }
          return next;
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [values, getById, resolved]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await search(query);
        setItems(results);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, search]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggle(id: string, item?: LookupItem) {
    if (values.includes(id)) {
      onChange(values.filter((v) => v !== id));
    } else {
      onChange([...values, id]);
      if (item) {
        setResolved((prev) => {
          const next = new Map(prev);
          next.set(id, item);
          return next;
        });
      }
    }
  }

  function remove(id: string) {
    onChange(values.filter((v) => v !== id));
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="min-h-[42px] w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm flex flex-wrap items-center gap-1.5 cursor-text"
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        {values.map((id) => {
          const item = resolved.get(id);
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              <span className="max-w-[220px] truncate">
                {item?.label ?? `${id.slice(0, 8)}…`}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(id);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          );
        })}
        <span
          className={`flex-1 min-w-[100px] py-0.5 ${
            disabled ? "text-muted-foreground/50" : "text-muted-foreground"
          }`}
        >
          {values.length === 0 ? placeholder : ""}
        </span>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg">
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search…"
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              items.map((item) => {
                const isSelected = values.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id, item)}
                    className="w-full text-left px-2 py-2 text-sm rounded hover:bg-muted/60 flex items-start justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{item.label}</div>
                      {item.sublabel && (
                        <div className="text-xs text-muted-foreground truncate">
                          {item.sublabel}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check size={14} className="text-primary shrink-0 mt-1" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
