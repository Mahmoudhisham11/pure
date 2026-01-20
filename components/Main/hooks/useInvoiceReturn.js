"use client";
import { useState, useRef } from "react";
import { invoiceService } from "../services/invoiceService";
import { stockService } from "../services/stockService";
import { useNotification } from "@/contexts/NotificationContext";
import dataReader from "@/lib/DataReader";

/**
 * Check if online
 */
const isOnline = () => {
  return typeof window !== "undefined" && navigator.onLine;
};

export function useInvoiceReturn() {
  const [returningItemsState, setReturningItemsState] = useState({});
  const processingRef = useRef({}); // استخدام useRef لتجنب race condition
  const { success, error: showError } = useNotification();

  const returnProduct = async (item, invoiceId, onUpdateInvoice) => {
    const itemKey = `${item.code}_${item.color || ""}_${item.size || ""}`;

    // التحقق من المعالجة باستخدام useRef لتجنب race condition
    if (processingRef.current[itemKey]) {
      return;
    }
    
    // تعيين حالة المعالجة
    processingRef.current[itemKey] = true;
    setReturningItemsState((prev) => ({ ...prev, [itemKey]: true }));

    let stockRestored = false;

    try {
      // ✅ Restore stock أولاً (يعمل في Online و Offline)
      await stockService.restoreStock(item);
      stockRestored = true;

      // ✅ Update invoice (يعمل في Online و Offline)
      const result = await invoiceService.returnProduct(item, invoiceId);

      if (result.success) {
        success(result.message || "تم إرجاع المنتج بنجاح");
        
        // ✅ جلب الفاتورة المحدثة من البيانات المحلية أولاً (أسرع وأكثر موثوقية)
        try {
          let updatedInvoice = null;
          
          // ✅ قراءة من localStorage أولاً (يعمل في Online و Offline)
          if (typeof window !== "undefined") {
            const offlineInvoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
            updatedInvoice = offlineInvoices.find(inv => inv.id === invoiceId || inv.queueId === invoiceId);
          }
          
          // ✅ إذا لم نجدها محلياً وكان Online، نحاول من Firebase
          if (!updatedInvoice && isOnline()) {
            try {
              updatedInvoice = await dataReader.getById("dailySales", invoiceId);
            } catch (firebaseErr) {
              console.warn("Could not fetch from Firebase:", firebaseErr);
            }
          }
          
          if (updatedInvoice) {
            // تحديث الفاتورة باستخدام callback
            if (onUpdateInvoice) {
              onUpdateInvoice(updatedInvoice);
            }
          } else {
            // ✅ الفاتورة تم حذفها (جميع المنتجات تم إرجاعها) - إغلاق الـ modal
            if (onUpdateInvoice) {
              onUpdateInvoice(null);
            }
          }
        } catch (fetchErr) {
          console.error("Error fetching updated invoice:", fetchErr);
          // لا نوقف العملية إذا فشل جلب الفاتورة المحدثة
        }
      } else {
        // Rollback: إرجاع المخزون مرة أخرى
        if (stockRestored) {
          try {
            await stockService.updateStockAfterSale([item]);
          } catch (rollbackErr) {
            console.error("Error rolling back stock:", rollbackErr);
            showError("⚠️ تم إرجاع المخزون لكن حدث خطأ في تحديث الفاتورة. يرجى التحقق يدوياً");
          }
        }
        showError(result.message || "حدث خطأ أثناء إرجاع المنتج");
      }
    } catch (err) {
      console.error("Error returning product:", err);
      
      // Rollback: إرجاع المخزون مرة أخرى في حالة الخطأ
      if (stockRestored) {
        try {
          await stockService.updateStockAfterSale([item]);
        } catch (rollbackErr) {
          console.error("Error rolling back stock:", rollbackErr);
        }
      }
      
      const errorMessage = err.message || err.toString() || "خطأ غير معروف";
      showError(`❌ حدث خطأ أثناء إرجاع المنتج: ${errorMessage}`);
    } finally {
      // ✅ إزالة حالة المعالجة دائماً (حتى في حالة الخطأ)
      delete processingRef.current[itemKey];
      setReturningItemsState((prev) => {
        const newState = { ...prev };
        delete newState[itemKey];
        return newState;
      });
    }
  };

  return { returnProduct, returningItemsState };
}
