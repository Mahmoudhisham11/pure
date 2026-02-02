"use client";
import styles from "../styles.module.css";

export default function EmployeeStatsModal({
  isOpen,
  onClose,
  employeeName,
  stats,
}) {
  if (!isOpen) return null;

  return (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div className={styles.popupBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
        <h3>إحصائيات الموظف — {employeeName}</h3>
        
        <div className={styles.popupBoxContent}>
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "16px",
            padding: "20px",
            background: "linear-gradient(135deg, var(--surface-hover) 0%, var(--card-bg) 100%)",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
            boxShadow: "var(--shadow-sm)"
          }}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              padding: "16px",
              background: "var(--surface)",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              boxShadow: "var(--shadow-sm)",
              transition: "all 0.3s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateX(-4px)";
              e.currentTarget.style.boxShadow = "var(--shadow-md)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateX(0)";
              e.currentTarget.style.boxShadow = "var(--shadow-sm)";
            }}
            >
              <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                عدد الفواتير:
              </span>
              <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--main-color)" }}>
                {stats.invoiceCount}
              </span>
            </div>
            
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              padding: "16px",
              background: "var(--surface)",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              boxShadow: "var(--shadow-sm)",
              transition: "all 0.3s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateX(-4px)";
              e.currentTarget.style.boxShadow = "var(--shadow-md)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateX(0)";
              e.currentTarget.style.boxShadow = "var(--shadow-sm)";
            }}
            >
              <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                عدد القطع:
              </span>
              <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--main-color)" }}>
                {stats.totalItems}
              </span>
            </div>
            
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              padding: "16px",
              background: "var(--surface)",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              boxShadow: "var(--shadow-sm)",
              transition: "all 0.3s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateX(-4px)";
              e.currentTarget.style.boxShadow = "var(--shadow-md)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateX(0)";
              e.currentTarget.style.boxShadow = "var(--shadow-sm)";
            }}
            >
              <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                إجمالي المبيعات:
              </span>
              <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--success)" }}>
                {stats.totalSales.toFixed(2)} جنيه
              </span>
            </div>
          </div>
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

