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
      <div className={styles.clientModalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.clientModalHeader}>
          <h3>إضافة بيانات العميل</h3>
          <button 
            className={styles.closeModalBtn} 
            onClick={onClose}
            disabled={isSaving}
            title="إغلاق"
          >
            ✕
          </button>
        </div>
        
        <div className={styles.clientModalContent}>
          <div className={styles.clientModalField}>
            <label className={styles.clientModalLabel}>
              <FaUser className={styles.fieldIcon} />
              اسم العميل
            </label>
            <input
              type="text"
              ref={nameRef}
              placeholder="اكتب اسم العميل"
              className={styles.clientModalInput}
              disabled={isSaving}
            />
          </div>

          <div className={styles.clientModalField}>
            <label className={styles.clientModalLabel}>
              <FaPhone className={styles.fieldIcon} />
              رقم الهاتف
            </label>
            <input
              type="text"
              ref={phoneRef}
              placeholder="اكتب رقم الهاتف"
              className={styles.clientModalInput}
              disabled={isSaving}
            />
          </div>

          <div className={styles.clientModalField}>
            <label className={styles.clientModalLabel}>
              <FaUserTie className={styles.fieldIcon} />
              اسم الموظف
            </label>
            <select
              value={selectedEmployee}
              onChange={(e) => onEmployeeChange(e.target.value)}
              className={styles.clientModalSelect}
              disabled={isSaving}
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

        <div className={styles.clientModalFooter}>
          <button 
            onClick={onClose} 
            disabled={isSaving}
            className={styles.clientModalCancelBtn}
          >
            إلغاء
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className={styles.clientModalSaveBtn}
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
  );
}


