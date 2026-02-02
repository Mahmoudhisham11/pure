"use client";
import styles from "../styles.module.css";
import { useRef } from "react";
import { FaUser, FaPhone, FaUserTie } from "react-icons/fa";

export default function ClientModal({
  isOpen,
  onClose,
  onSave,
  employees,
  selectedEmployee,
  onEmployeeChange,
  isSaving,
}) {
  const nameRef = useRef();
  const phoneRef = useRef();

  if (!isOpen) return null;

  const handleSave = () => {
    const clientName = nameRef.current?.value || "";
    const phone = phoneRef.current?.value || "";
    onSave({ clientName, phone });
  };

  return (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div className={styles.popupBox} onClick={(e) => e.stopPropagation()}>
        <h3>إضافة بيانات العميل</h3>
        
        <div className={styles.popupBoxContent}>
          <div className={styles.priceInput}>
            <label>
              <FaUser style={{ marginLeft: "8px", color: "var(--main-color)" }} />
              اسم العميل
            </label>
            <input
              type="text"
              ref={nameRef}
              placeholder="اكتب اسم العميل"
              className={styles.modalInput}
              disabled={isSaving}
            />
          </div>

          <div className={styles.priceInput}>
            <label>
              <FaPhone style={{ marginLeft: "8px", color: "var(--main-color)" }} />
              رقم الهاتف
            </label>
            <input
              type="text"
              ref={phoneRef}
              placeholder="اكتب رقم الهاتف"
              className={styles.modalInput}
              disabled={isSaving}
            />
          </div>

          <div className={styles.priceInput}>
            <label>
              <FaUserTie style={{ marginLeft: "8px", color: "var(--main-color)" }} />
              اسم الموظف
            </label>
            <select
              value={selectedEmployee}
              onChange={(e) => onEmployeeChange(e.target.value)}
              className={styles.modalInput}
              disabled={isSaving}
              style={{ cursor: "pointer" }}
            >
              <option value="">اختر الموظف</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.name}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.popupBoxFooter}>
          <div className={styles.popupBtns}>
            <button 
              onClick={onClose} 
              disabled={isSaving}
              className={styles.cancelBtn}
            >
              إلغاء
            </button>
            <button 
              onClick={handleSave} 
              disabled={isSaving}
              className={styles.addBtn}
            >
              {isSaving ? (
                <>
                  <span className={styles.spinner}></span>
                  جاري الحفظ...
                </>
              ) : (
                "حفظ"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


