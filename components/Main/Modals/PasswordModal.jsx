"use client";
import styles from "../styles.module.css";
import { useState, useEffect, useRef } from "react";

export default function PasswordModal({
  isOpen,
  onClose,
  onConfirm,
  finalPrice,
  title = "إدخال كلمة المرور",
  message = "أدخل كلمة المرور للسماح بالخصم",
}) {
  const [password, setPassword] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setPassword("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(password);
    setPassword("");
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
        <h3>{title}</h3>
        
        <div className={styles.popupBoxContent}>
          {message && (
            <p className={styles.popupMessage}>{message}</p>
          )}
          {finalPrice && (
            <div className={styles.priceInfo} style={{ marginTop: 0 }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '8px 0'
              }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>السعر النهائي:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '16px' }}>
                  {finalPrice} EGP
                </span>
              </div>
            </div>
          )}
          
          <div className={styles.priceInput}>
            <label>كلمة المرور:</label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyPress}
              className={styles.modalInput}
              placeholder="أدخل كلمة المرور"
              autoFocus
            />
          </div>
        </div>
        
        <div className={styles.popupBoxFooter}>
          <div className={styles.popupBtns}>
            <button onClick={onClose} className={styles.cancelBtn}>
              إلغاء
            </button>
            <button onClick={handleConfirm} className={styles.addBtn} disabled={!password.trim()}>
              تأكيد
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



