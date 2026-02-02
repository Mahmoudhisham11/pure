"use client";
import { useState, useEffect, useRef } from "react";
import styles from "../styles.module.css";

export default function InputModal({
  isOpen,
  onClose,
  onConfirm,
  title = "إدخال البيانات",
  message = "",
  placeholder = "",
  defaultValue = "",
  type = "text",
  min,
  max,
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setValue(defaultValue);
    } else {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (value.trim() || type === "number") {
      onConfirm(value);
      setValue("");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleConfirm();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.inputModal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ 
          margin: 0, 
          padding: "24px", 
          fontSize: "1.4rem", 
          fontWeight: 700, 
          color: "var(--text-primary)", 
          textAlign: "center", 
          borderBottom: "1px solid var(--border-color)",
          background: "linear-gradient(135deg, var(--surface-hover) 0%, var(--surface) 100%)"
        }}>
          {title}
        </h3>
        
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {message && (
            <p style={{ 
              margin: 0, 
              color: "var(--text-secondary)", 
              fontSize: "15px", 
              lineHeight: "1.6",
              textAlign: "center"
            }}>
              {message}
            </p>
          )}
          
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ 
              color: "var(--text-primary)", 
              fontWeight: 600, 
              fontSize: "15px" 
            }}>
              القيمة:
            </label>
            <input
              ref={inputRef}
              type={type}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyPress}
              className={styles.modalInput}
              placeholder={placeholder}
              min={min}
              max={max}
              autoFocus
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "2px solid var(--border-color)",
                borderRadius: "10px",
                fontSize: "16px",
                color: "var(--text-primary)",
                backgroundColor: "var(--input-bg)",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "var(--shadow-sm)"
              }}
            />
          </div>
        </div>
        
        <div style={{ 
          padding: "16px 24px", 
          borderTop: "1px solid var(--border-color)", 
          background: "var(--surface-hover)" 
        }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button 
              onClick={onClose} 
              style={{
                minWidth: "120px",
                padding: "12px 24px",
                border: "1px solid var(--border-color)",
                borderRadius: "10px",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "var(--shadow-sm)",
                backgroundColor: "var(--surface)",
                color: "var(--text-primary)"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "var(--shadow-md)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--surface)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "var(--shadow-sm)";
              }}
            >
              إلغاء
            </button>
            <button
              onClick={handleConfirm}
              className={styles.btnPrimary}
              disabled={type === "text" && !value.trim()}
              style={{
                minWidth: "120px",
                padding: "12px 24px",
                borderRadius: "10px",
                fontSize: "15px",
                fontWeight: 600,
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "var(--shadow-sm)"
              }}
            >
              تأكيد
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



