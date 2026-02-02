"use client";
import styles from "../styles.module.css";
import { useState, useEffect, useRef } from "react";

export default function SuspendInvoiceModal({
  isOpen,
  onClose,
  onConfirm,
}) {
  const [clientName, setClientName] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setClientName("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!clientName.trim()) {
      return;
    }
    onConfirm(clientName.trim());
    setClientName("");
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleConfirm();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div className={styles.popupBox} onClick={(e) => e.stopPropagation()}>
        <h3>تعليق الفاتورة</h3>
        
        <div className={styles.popupBoxContent}>
          <p className={styles.popupMessage}>
            أدخل اسم العميل لتعليق الفاتورة
          </p>
          
          <div className={styles.priceInput}>
            <label>اسم العميل:</label>
            <input
              ref={inputRef}
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              onKeyDown={handleKeyPress}
              className={styles.modalInput}
              placeholder="أدخل اسم العميل"
              autoFocus
            />
          </div>
        </div>
        
        <div className={styles.popupBoxFooter}>
          <div className={styles.popupBtns}>
            <button onClick={onClose} className={styles.cancelBtn}>
              إلغاء
            </button>
            <button onClick={handleConfirm} className={styles.addBtn} disabled={!clientName.trim()}>
              تعليق الفاتورة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

