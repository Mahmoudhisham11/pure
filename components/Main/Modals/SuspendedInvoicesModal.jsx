"use client";
import styles from "../styles.module.css";
import { FaRegTrashAlt } from "react-icons/fa";

export default function SuspendedInvoicesModal({
  isOpen,
  onClose,
  suspendedInvoices,
  onRestore,
  onDelete,
}) {
  if (!isOpen) return null;

  return (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div className={styles.popupBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px", width: "90%" }}>
        <h3>الفواتير المعلقة</h3>
        
        <div className={styles.popupBoxContent} style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {suspendedInvoices.length === 0 ? (
            <div className={styles.emptyState} style={{ textAlign: "center", padding: "40px" }}>
              <p>لا توجد فواتير معلقة</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {suspendedInvoices.map((invoice, index) => (
                <div
                  key={index}
                  style={{
                    padding: "16px",
                    background: "linear-gradient(135deg, var(--surface-hover) 0%, var(--card-bg) 100%)",
                    borderRadius: "12px",
                    border: "1px solid var(--border-color)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    boxShadow: "var(--shadow-sm)",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "var(--shadow-md)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "var(--shadow-sm)";
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 600, color: "var(--text-primary)", fontSize: "16px" }}>
                      {invoice.clientName || "بدون اسم"}
                    </p>
                    <p style={{ margin: "6px 0 0 0", fontSize: "14px", color: "var(--text-secondary)" }}>
                      {invoice.items?.length || 0} منتج - الإجمالي: {invoice.total?.toFixed(2) || "0.00"} جنيه
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => onRestore(index)}
                      className={styles.addBtn}
                      style={{ padding: "10px 20px", fontSize: "14px", minWidth: "100px" }}
                    >
                      استعادة
                    </button>
                    <button
                      onClick={() => onDelete(index)}
                      className={styles.deleteBtn}
                      style={{ padding: "10px 12px", minWidth: "44px" }}
                      title="حذف"
                    >
                      <FaRegTrashAlt />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className={styles.popupBoxFooter}>
          <div className={styles.popupBtns}>
            <button onClick={onClose} className={styles.cancelBtn}>
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

