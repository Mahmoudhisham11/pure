"use client";
import styles from "../styles.module.css";

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

  return (
    <div className={styles.popupOverlay} onClick={isLoading ? undefined : onClose}>
      <div className={styles.popupBox} onClick={(e) => e.stopPropagation()}>
        <h3>{title || "تأكيد العملية"}</h3>
        <div className={styles.popupBoxContent}>
          <p className={styles.popupMessage}>{message}</p>
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




