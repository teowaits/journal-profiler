import { useRef, useState } from "react";
import { searchSources } from "../api.js";
import { C, SEARCH_DELAY_MS } from "../constants.js";

/**
 * @param {{
 *   onSelect: (source: object) => void,
 *   placeholder?: string,
 *   disabled?: boolean,
 * }} props
 */
export default function JournalSearch({ onSelect, placeholder = "Search for a journal…", disabled }) {
  const [input, setInput]           = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [focused, setFocused]       = useState(false);
  const [activeIdx, setActiveIdx]   = useState(-1);
  const debounceRef  = useRef(null);
  const abortRef     = useRef(null);

  const onInput = (val) => {
    setInput(val);
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    if (val.length < 2) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      abortRef.current = new AbortController();
      setSearching(true);
      try {
        const results = await searchSources(val, abortRef.current.signal);
        setSuggestions(results);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]);
        setActiveIdx(-1);
      }
      setSearching(false);
    }, SEARCH_DELAY_MS);
  };

  const handleSelect = (source) => {
    setInput("");
    setSuggestions([]);
    setActiveIdx(-1);
    onSelect(source);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        e.preventDefault();
        handleSelect(suggestions[activeIdx]);
      }
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setActiveIdx(-1);
    }
  };

  const showDropdown = focused && (suggestions.length > 0 || searching);

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: C.surface2,
          border: `1px solid ${focused ? C.blue : C.border}`,
          borderRadius: 8,
          padding: "0 12px",
          gap: 8,
          transition: "border-color 0.15s",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="6.5" cy="6.5" r="5" stroke={C.textMuted} strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke={C.textMuted} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={input}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setTimeout(() => { setSuggestions([]); setActiveIdx(-1); }, 200);
          }}
          onKeyDown={handleKeyDown}
          onChange={e => onInput(e.target.value)}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: C.textPrimary,
            fontSize: 13,
            fontFamily: "'IBM Plex Mono', monospace",
            padding: "10px 0",
          }}
        />
        {searching && (
          <div
            style={{
              width: 12,
              height: 12,
              border: `1.5px solid ${C.border2}`,
              borderTopColor: C.blue,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              flexShrink: 0,
            }}
          />
        )}
      </div>

      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            zIndex: 100,
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {searching && suggestions.length === 0 && (
            <div style={{ padding: "10px 14px", fontSize: 12, color: C.textMuted }}>
              Searching…
            </div>
          )}
          {suggestions.map((s, i) => (
            <div
              key={s.id}
              onMouseDown={() => handleSelect(s)}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(-1)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                borderBottom: `1px solid ${C.border}`,
                background: activeIdx === i ? C.border : "transparent",
              }}
            >
              <div style={{ fontSize: 13, color: C.textPrimary, fontWeight: 500 }}>
                {s.display_name}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, display: "flex", gap: 12 }}>
                {s.host_organization?.display_name && <span>{s.host_organization.display_name}</span>}
                {s.issn_l && <span>ISSN {s.issn_l}</span>}
                {s.works_count != null && (
                  <span>{s.works_count.toLocaleString()} works</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
