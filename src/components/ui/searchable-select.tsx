"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface SearchableOption { id: string; name: string; }

interface SearchableSelectProps {
  options: SearchableOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  optionClassName?: (option: SearchableOption) => string;
  optionSuffix?: (option: SearchableOption) => ReactNode;
}

export function SearchableSelect({ options, value, onChange, placeholder = "Select...", searchPlaceholder = "Search...", disabled = false, emptyMessage = "No results found.", optionClassName, optionSuffix }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.name.toLowerCase().includes(query));
  }, [options, search]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function selectOption(id: string) { onChange(id); setOpen(false); setSearch(""); }
  function clearOption(event: React.MouseEvent) { event.stopPropagation(); onChange(""); setOpen(false); setSearch(""); }

  return (
    <div ref={containerRef} className="relative w-full">
      <button type="button" disabled={disabled} onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm shadow-sm outline-none transition hover:border-zinc-300 focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50">
        <span className={selected ? "truncate text-zinc-900" : "truncate text-zinc-400"}>{selected?.name ?? placeholder}</span>
        <div className="ml-2 flex shrink-0 items-center gap-1">{selected && <span onClick={clearOption} className="cursor-pointer rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X size={14} /></span>}<ChevronDown size={16} className="text-zinc-400" /></div>
      </button>
      {open && <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[280px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-3"><Search size={16} className="shrink-0 text-zinc-400" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-zinc-400" /></div>
        <div className="max-h-72 overflow-y-auto p-1">
          {filteredOptions.length === 0 ? <div className="px-3 py-8 text-center text-sm text-zinc-400">{emptyMessage}</div> : filteredOptions.map((option) => { const isSelected = option.id === value; return <button key={option.id} type="button" onClick={() => selectOption(option.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-zinc-100 ${optionClassName?.(option) ?? ""}`}><span className="truncate">{option.name}</span><span className="ml-3 flex shrink-0 items-center gap-2">{optionSuffix?.(option)}{isSelected && <Check size={16} />}</span></button>; })}
        </div>
      </div>}
    </div>
  );
}
