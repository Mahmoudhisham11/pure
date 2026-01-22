// Service for invoice operations
import {
  collection,
  query,
  where,
  addDoc,
  doc,
  setDoc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/app/firebase";
import dataLayer from "@/lib/DataLayer";
import dataReader from "@/lib/DataReader";
import { calculateSubtotal, calculateProfit } from "@/utils/cartHelpers";
import { offlineAdd, offlineUpdate, offlineDelete } from "@/utils/firebaseOffline";

/**
 * Check if online
 */
const isOnline = () => {
  return typeof window !== "undefined" && navigator.onLine;
};

// Helper function to get next invoice number
// محسّن: قراءة من جميع المصادر (localStorage و Firebase) وأخذ أكبر رقم
const getNextInvoiceNumber = async (shop) => {
  if (typeof window === "undefined") return 1;
  
  try {
    let maxInvoiceNumber = 0;
    
    // 1. قراءة من localStorage (offlineInvoices)
    try {
      const offlineInvoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
      const shopInvoices = shop ? offlineInvoices.filter(inv => inv.shop === shop) : offlineInvoices;
      
      shopInvoices.forEach(inv => {
        const invNumber = Number(inv.invoiceNumber || 0);
        if (invNumber > maxInvoiceNumber) {
          maxInvoiceNumber = invNumber;
        }
      });
    } catch (error) {
      console.error("Error reading offline invoices:", error);
    }
    
    // 2. قراءة من Firebase (إذا كان online)
    if (isOnline()) {
      try {
        const q = shop 
          ? query(collection(db, "dailySales"), where("shop", "==", shop))
          : collection(db, "dailySales");
        const firebaseInvoices = await dataReader.get(q);
        
        firebaseInvoices.forEach(inv => {
          const invNumber = Number(inv.invoiceNumber || 0);
          if (invNumber > maxInvoiceNumber) {
            maxInvoiceNumber = invNumber;
          }
        });
      } catch (error) {
        console.error("Error reading Firebase invoices:", error);
        // نكمل بدون إيقاف العملية
      }
    }
    
    // 3. حساب الرقم التالي
    const nextInvoiceNumber = maxInvoiceNumber + 1;
    
    // 4. حفظ في localStorage للاستخدام السريع في المرة القادمة
    localStorage.setItem("lastInvoiceNumber", nextInvoiceNumber.toString());
    
    // 5. مزامنة مع Firebase في الخلفية (غير متزامن) - فقط للنسخ الاحتياطي
    if (isOnline()) {
      setDoc(
        doc(db, "counters", "invoiceCounter"),
        { lastInvoiceNumber: nextInvoiceNumber },
        { merge: true }
      ).catch((error) => {
        console.error("Error syncing invoice number to Firebase:", error);
        // لا نوقف العملية إذا فشلت المزامنة
      });
    }
    
    return nextInvoiceNumber;
  } catch (error) {
    console.error("Error getting invoice number:", error);
    // Fallback: استخدام localStorage فقط
    try {
      const saved = localStorage.getItem("lastInvoiceNumber");
      const currentNumber = saved ? parseInt(saved, 10) : 0;
      const invoiceNumber = currentNumber + 1;
      localStorage.setItem("lastInvoiceNumber", invoiceNumber.toString());
      return invoiceNumber;
    } catch (fallbackError) {
      console.error("Error in fallback:", fallbackError);
      return 1;
    }
  }
};

export const invoiceService = {
  async createInvoice(cart, clientData, shop, employee) {
    try {
      // Get next invoice number (based on actual invoices from all sources)
      const invoiceNumber = await getNextInvoiceNumber(shop);

      // Calculate totals
      const total = calculateSubtotal(cart);
      const profit = calculateProfit(cart);

      // Prepare invoice data
      const saleData = {
        invoiceNumber,
        cart,
        clientName: clientData.clientName || "",
        phone: clientData.phone || "",
        date: new Date(),
        shop,
        total,
        profit,
        employee: employee || "غير محدد",
        discount: clientData.discount || 0,
        discountNotes: clientData.discountNotes || "",
      };

      // ✅ استخدام offlineAdd للعمل في Online و Offline
      const result = await offlineAdd("dailySales", saleData);
      return { 
        success: true, 
        invoice: { id: result.id || result.queueId, ...saleData },
      };
    } catch (error) {
      console.error("Error creating invoice:", error);
      return { success: false, error };
    }
  },

  async getInvoiceByNumber(invoiceNumber) {
    try {
      const q = query(
        collection(db, "dailySales"),
        where("invoiceNumber", "==", Number(invoiceNumber))
      );
      const invoices = await dataReader.get(q);

      if (invoices.length === 0) {
        return { success: false, message: "الفاتورة غير موجودة" };
      }

      const invoiceData = invoices[0];
      return { success: true, invoice: invoiceData };
    } catch (error) {
      console.error("Error getting invoice:", error);
      return { success: false, error };
    }
  },

  async returnProduct(item, invoiceId) {
    try {
      // ✅ قراءة من البيانات المحلية أولاً (أسرع وأكثر موثوقية في Offline)
      let invoiceData = null;
      
      if (typeof window !== "undefined") {
        const offlineInvoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
        invoiceData = offlineInvoices.find(inv => inv.id === invoiceId || inv.queueId === invoiceId);
      }
      
      // ✅ إذا لم نجدها محلياً وكان Online، نحاول من Firebase
      if (!invoiceData && typeof window !== "undefined" && navigator.onLine) {
        try {
          invoiceData = await dataReader.getById("dailySales", invoiceId);
        } catch (firebaseErr) {
          console.warn("Could not fetch invoice from Firebase:", firebaseErr);
        }
      }

      if (!invoiceData) {
        return { success: false, message: "الفاتورة غير موجودة" };
      }
      
      if (!Array.isArray(invoiceData.cart) || invoiceData.cart.length === 0) {
        return { success: false, message: "الفاتورة فارغة" };
      }

      // البحث عن المنتج المراد إرجاعه
      // نستخدم منطق أفضل: نبحث عن أول منتج يطابق الكود واللون والمقاس
      // ثم نحذف الكمية المطلوبة (أو المنتج بالكامل إذا كانت الكمية متطابقة)
      let itemFound = false;
      let itemIndex = -1;
      
      for (let i = 0; i < invoiceData.cart.length; i++) {
        const p = invoiceData.cart[i];
        const matchesCode = p.code === item.code;
        const matchesColor = (p.color || "") === (item.color || "");
        const matchesSize = (p.size || "") === (item.size || "");
        
        if (matchesCode && matchesColor && matchesSize) {
          itemIndex = i;
          itemFound = true;
          break;
        }
      }

      if (!itemFound) {
        return { success: false, message: "المنتج غير موجود في الفاتورة" };
      }

      const foundItem = invoiceData.cart[itemIndex];
      
      // التحقق من الكمية
      if (foundItem.quantity < item.quantity) {
        return { 
          success: false, 
          message: `الكمية المطلوبة (${item.quantity}) أكبر من الكمية في الفاتورة (${foundItem.quantity})` 
        };
      }

      // إنشاء نسخة محدثة من الـ cart
      const updatedCart = [...invoiceData.cart];
      
      if (foundItem.quantity === item.quantity) {
        // حذف المنتج بالكامل إذا كانت الكمية متطابقة
        updatedCart.splice(itemIndex, 1);
      } else {
        // تقليل الكمية إذا كانت الكمية المطلوبة أقل
        updatedCart[itemIndex] = {
          ...foundItem,
          quantity: foundItem.quantity - item.quantity,
        };
      }

      if (updatedCart.length > 0) {
        const newTotal = calculateSubtotal(updatedCart);
        const newProfit = calculateProfit(updatedCart);

        // ✅ استخدام offlineUpdate للعمل في Online و Offline
        await offlineUpdate("dailySales", invoiceId, {
          cart: updatedCart,
          total: newTotal,
          profit: newProfit,
        });

        return { success: true, message: "تم إرجاع المنتج بنجاح" };
      } else {
        await offlineDelete("dailySales", invoiceId);
        return { success: true, message: "تم إرجاع المنتج وحذف الفاتورة" };
      }
    } catch (error) {
      console.error("Error returning product:", error);
      return { 
        success: false, 
        message: error.message || "حدث خطأ أثناء إرجاع المنتج",
        error 
      };
    }
  },
};
