"use client";
import styles from "../styles.module.css";
import { FaExclamationTriangle, FaExclamationCircle } from "react-icons/fa";

export default function ConfirmModal({
  isOpen,
  onClose,
  title,
  message,
  onConfirm,
  confirmText = "تأكيد",
  cancelText = "إلغاء",
  type = "warning",
  isLoading = false,
}) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (isLoading) return;
    // المكوّن الأب هو المسؤول عن إغلاق الـ modal بعد نجاح العملية
    onConfirm?.();
  };

  const getIcon = () => {
    if (type === "danger") {
      return <FaExclamationCircle style={{ color: "#f44336", fontSize: "24px" }} />;
    }
    return <FaExclamationTriangle style={{ color: "#ff9800", fontSize: "24px" }} />;
  };

  return (
    <div className={styles.popupOverlay} onClick={isLoading ? undefined : onClose}>
      <div className={styles.popupBox} onClick={(e) => e.stopPropagation()}>
        <h3>{title || "تأكيد العملية"}</h3>
        <div className={styles.popupBoxContent}>
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            alignItems: "center", 
            gap: "16px",
            padding: "8px 0"
          }}>
            {getIcon()}
            <p className={styles.popupMessage} style={{ textAlign: "center", margin: 0 }}>
              {message}
            </p>
          </div>
        </div>
        <div className={styles.popupBoxFooter}>
          <div className={styles.popupBtns}>
            <button
              onClick={onClose}
              className={styles.cancelBtn}
              disabled={isLoading}
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              className={`${styles.confirmBtn} ${
                type === "danger" ? styles.danger : ""
              }`}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className={styles.spinner}></span>
                  جاري المعالجة...
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}




