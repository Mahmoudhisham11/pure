/**
 * Complete Firebase Offline Wrappers
 * 
 * Provides offline support for all collections:
 * - dailySales (invoices)
 * - lacosteProducts (products)
 * - masrofat (expenses)
 * - wared (incoming products)
 * - employees
 * - debtsPayments
 * - وغيرها
 * 
 * @module utils/firebaseOffline
 */

import dataLayer from "@/lib/DataLayer";
import { offlineQueue } from "./offlineQueue";
import dataReader from "@/lib/DataReader";
import { getProductFromLocalStorage } from "@/utils/productHelpers";

/**
 * Check if online
 */
const isOnline = () => {
  return typeof window !== "undefined" && navigator.onLine;
};

/**
 * Check if operation should be queued even when online fails
 */
const shouldQueueOnError = (error) => {
  return (
    error.code === "unavailable" ||
    error.code === "deadline-exceeded" ||
    error.message?.includes("network") ||
    error.message?.includes("Failed to fetch")
  );
};

/**
 * حفظ البيانات محلياً للعرض الفوري
 */
function saveToLocalStorage(collectionName, action, data, queueId) {
  if (typeof window === "undefined") return;
  
  try {
    switch (collectionName) {
      case "dailySales":
        if (action === "add") {
          const invoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
          invoices.push({
            id: queueId,
            queueId,
            ...data,
            isOffline: true
          });
          localStorage.setItem("offlineInvoices", JSON.stringify(invoices));
          window.dispatchEvent(new Event("offlineInvoiceAdded"));
        }
        break;
        
      case "masrofat":
        if (action === "add") {
          const masrofat = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
          masrofat.push({
            id: queueId,
            queueId,
            ...data,
            isOffline: true
          });
          localStorage.setItem("offlineMasrofat", JSON.stringify(masrofat));
          window.dispatchEvent(new Event("offlineMasrofAdded"));
        }
        break;
        
      case "wared":
        if (action === "add") {
          const wared = JSON.parse(localStorage.getItem("offlineWared") || "[]");
          // ✅ إضافة التاريخ إذا لم يكن موجوداً
          // ✅ تحويل Firebase Timestamp إلى Date object أو string للتوافق مع localStorage
          let dateValue = data.date || new Date();
          if (dateValue && typeof dateValue.toDate === "function") {
            // Firebase Timestamp - تحويله إلى Date object
            dateValue = dateValue.toDate();
          } else if (dateValue && dateValue.seconds) {
            // Firebase Timestamp serialized - تحويله إلى Date object
            dateValue = new Date(dateValue.seconds * 1000);
          }
          // ✅ تحويل Date object إلى ISO string للتوافق مع JSON.stringify
          if (dateValue instanceof Date) {
            dateValue = dateValue.toISOString();
          }
          
          const waredData = {
            id: queueId,
            queueId,
            ...data,
            date: dateValue, // ✅ التاريخ كـ ISO string
            isOffline: true
          };
          wared.push(waredData);
          localStorage.setItem("offlineWared", JSON.stringify(wared));
          window.dispatchEvent(new CustomEvent("offlineWaredAdded", { detail: { wared: waredData } }));
        } else if (action === "delete") {
          const wared = JSON.parse(localStorage.getItem("offlineWared") || "[]");
          const filtered = wared.filter(item => item.id !== data.docId && item.queueId !== data.docId);
          localStorage.setItem("offlineWared", JSON.stringify(filtered));
          window.dispatchEvent(new CustomEvent("offlineWaredRemoved", { detail: { waredId: data.docId } }));
        }
        break;
        
      case "lacosteProducts":
        if (action === "add") {
          // حفظ المنتج محلياً للعرض الفوري
          const products = JSON.parse(localStorage.getItem("offlineProducts") || "[]");
          
          // ✅ التحقق من عدم التكرار قبل الإضافة - تحقق أقوى
          const existingProduct = products.find(
            p => 
              // نفس queueId أو id
              p.queueId === queueId || p.id === queueId ||
              // نفس code + shop + type
              (p.code === data.code && p.shop === data.shop && p.type === (data.type || "product")) ||
              // منع التكرار في نفس الثانية (نفس code + shop + name + type في نفس الثانية)
              (p.code === data.code && 
               p.shop === data.shop && 
               p.name === data.name && 
               p.type === (data.type || "product") &&
               data.date && p.date &&
               Math.abs(
                 (typeof p.date === 'object' && p.date.toDate ? p.date.toDate().getTime() : 
                  typeof p.date === 'string' ? new Date(p.date).getTime() : 
                  typeof p.date === 'number' ? p.date : 0) -
                 (typeof data.date === 'object' && data.date.toDate ? data.date.toDate().getTime() : 
                  typeof data.date === 'string' ? new Date(data.date).getTime() : 
                  typeof data.date === 'number' ? data.date : Date.now())
               ) < 2000) // خلال ثانيتين
          );
          
          if (!existingProduct) {
            products.push({ id: queueId, queueId, ...data, isOffline: true });
            localStorage.setItem("offlineProducts", JSON.stringify(products));
            window.dispatchEvent(new CustomEvent("offlineProductAdded", { detail: { product: { id: queueId, queueId, ...data, isOffline: true } } }));
          } else {
            console.warn("Product already exists in localStorage, skipping duplicate", { code: data.code, name: data.name, shop: data.shop });
          }
        } else if (action === "update") {
          // تحديث المنتج محلياً
          const products = JSON.parse(localStorage.getItem("offlineProducts") || "[]");
          const productIndex = products.findIndex(p => p.id === docId || p.queueId === docId);
          if (productIndex !== -1) {
            products[productIndex] = { ...products[productIndex], ...data };
            localStorage.setItem("offlineProducts", JSON.stringify(products));
            window.dispatchEvent(new CustomEvent("offlineProductUpdated", { detail: { productId: docId, data } }));
          }
        } else if (action === "delete") {
          // حذف المنتج محلياً
          const products = JSON.parse(localStorage.getItem("offlineProducts") || "[]");
          const filtered = products.filter(p => p.id !== docId && p.queueId !== docId);
          localStorage.setItem("offlineProducts", JSON.stringify(filtered));
          window.dispatchEvent(new CustomEvent("offlineProductDeleted", { detail: { productId: docId } }));
        }
        break;
        
      case "cart":
        if (action === "add") {
          // حفظ عنصر السلة محلياً للعرض الفوري
          const cart = JSON.parse(localStorage.getItem("offlineCart") || "[]");
          cart.push({ id: queueId, queueId, ...data, isOffline: true });
          localStorage.setItem("offlineCart", JSON.stringify(cart));
          window.dispatchEvent(new CustomEvent("offlineCartItemAdded", { detail: { item: { id: queueId, queueId, ...data, isOffline: true } } }));
        }
        break;
    }
  } catch (error) {
    console.error("Error saving to localStorage:", error);
  }
}

/**
 * تحديث البيانات المحلية
 */
async function updateLocalStorage(collectionName, docId, data) {
  if (typeof window === "undefined") return;
  
  try {
    switch (collectionName) {
      case "dailySales":
        const invoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
        const invoiceIndex = invoices.findIndex(inv => inv.id === docId || inv.queueId === docId);
        if (invoiceIndex !== -1) {
          invoices[invoiceIndex] = { ...invoices[invoiceIndex], ...data };
          localStorage.setItem("offlineInvoices", JSON.stringify(invoices));
          window.dispatchEvent(new Event("offlineInvoiceUpdated"));
        }
        break;
        
      case "masrofat":
        const masrofat = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
        const masrofIndex = masrofat.findIndex(m => m.id === docId || m.queueId === docId);
        if (masrofIndex !== -1) {
          masrofat[masrofIndex] = { ...masrofat[masrofIndex], ...data };
          localStorage.setItem("offlineMasrofat", JSON.stringify(masrofat));
          window.dispatchEvent(new CustomEvent("offlineMasrofUpdated", { detail: { masrofId: docId, data } }));
        }
        break;
        
      case "lacosteProducts":
        const products = JSON.parse(localStorage.getItem("offlineProducts") || "[]");
        const productIndex = products.findIndex(p => p.id === docId || p.queueId === docId);
        if (productIndex !== -1) {
          // ✅ تحديث المنتج الموجود
          products[productIndex] = { ...products[productIndex], ...data };
          localStorage.setItem("offlineProducts", JSON.stringify(products));
          window.dispatchEvent(new CustomEvent("offlineProductUpdated", { detail: { productId: docId, data } }));
        } else {
          // ✅ المنتج غير موجود محلياً - نحصل على بياناته الكاملة من Firebase/IndexedDB
          const shop = data.shop || (typeof window !== "undefined" ? localStorage.getItem("shop") : null);
          let existingProduct = getProductFromLocalStorage(docId, shop);
          
          // إذا لم نجده محلياً، نحاول من Firebase/IndexedDB
          if (!existingProduct) {
            try {
              const firebaseProduct = await dataReader.getById("lacosteProducts", docId);
              if (firebaseProduct) {
                existingProduct = firebaseProduct;
              }
            } catch (error) {
              // في حالة الخطأ، نستخدم البيانات المحدثة فقط
              console.log("Could not fetch product from Firebase/IndexedDB:", error);
            }
          }
          
          // ✅ دمج البيانات الموجودة (إن وجدت) مع التحديثات الجديدة
          const updatedProduct = existingProduct
            ? { ...existingProduct, ...data, id: docId, isOffline: false }
            : { id: docId, ...data, isOffline: false };
          
          products.push(updatedProduct);
          localStorage.setItem("offlineProducts", JSON.stringify(products));
          window.dispatchEvent(new CustomEvent("offlineProductUpdated", { detail: { productId: docId, data } }));
        }
        break;
        
      case "wared":
        const wared = JSON.parse(localStorage.getItem("offlineWared") || "[]");
        const waredIndex = wared.findIndex(w => w.id === docId || w.queueId === docId);
        if (waredIndex !== -1) {
          wared[waredIndex] = { ...wared[waredIndex], ...data };
          localStorage.setItem("offlineWared", JSON.stringify(wared));
          window.dispatchEvent(new CustomEvent("offlineWaredUpdated", { detail: { waredId: docId, data } }));
        }
        break;
        
      case "cart":
        const cart = JSON.parse(localStorage.getItem("offlineCart") || "[]");
        const cartIndex = cart.findIndex(c => c.id === docId || c.queueId === docId);
        if (cartIndex !== -1) {
          cart[cartIndex] = { ...cart[cartIndex], ...data };
          localStorage.setItem("offlineCart", JSON.stringify(cart));
          window.dispatchEvent(new CustomEvent("offlineCartItemUpdated", { detail: { itemId: docId, data } }));
        }
        break;
    }
  } catch (error) {
    console.error("Error updating localStorage:", error);
  }
}

/**
 * حذف البيانات المحلية
 */
function removeFromLocalStorage(collectionName, docId) {
  if (typeof window === "undefined") return;
  
  try {
    switch (collectionName) {
      case "dailySales":
        const invoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
        const filteredInvoices = invoices.filter(inv => inv.id !== docId && inv.queueId !== docId);
        localStorage.setItem("offlineInvoices", JSON.stringify(filteredInvoices));
        window.dispatchEvent(new CustomEvent("offlineInvoiceRemoved", { detail: { invoiceId: docId } }));
        break;
        
      case "masrofat":
        const masrofat = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
        const filteredMasrofat = masrofat.filter(m => m.id !== docId && m.queueId !== docId);
        localStorage.setItem("offlineMasrofat", JSON.stringify(filteredMasrofat));
        window.dispatchEvent(new CustomEvent("offlineMasrofRemoved", { detail: { masrofId: docId } }));
        break;
        
      case "wared":
        const wared = JSON.parse(localStorage.getItem("offlineWared") || "[]");
        const filteredWared = wared.filter(item => item.id !== docId && item.queueId !== docId);
        localStorage.setItem("offlineWared", JSON.stringify(filteredWared));
        window.dispatchEvent(new CustomEvent("offlineWaredRemoved", { detail: { waredId: docId } }));
        break;
        
      case "lacosteProducts":
        const products = JSON.parse(localStorage.getItem("offlineProducts") || "[]");
        const filteredProducts = products.filter(p => p.id !== docId && p.queueId !== docId);
        localStorage.setItem("offlineProducts", JSON.stringify(filteredProducts));
        window.dispatchEvent(new CustomEvent("offlineProductDeleted", { detail: { productId: docId } }));
        break;
        
      case "cart":
        const cart = JSON.parse(localStorage.getItem("offlineCart") || "[]");
        const filteredCart = cart.filter(c => c.id !== docId && c.queueId !== docId);
        localStorage.setItem("offlineCart", JSON.stringify(filteredCart));
        window.dispatchEvent(new CustomEvent("offlineCartItemRemoved", { detail: { itemId: docId } }));
        break;
    }
  } catch (error) {
    console.error("Error removing from localStorage:", error);
  }
}

/**
 * تحديث البيانات المحلية بالـ ID الحقيقي من Firebase
 */
function updateLocalDataWithFirebaseId(collectionName, queueId, firebaseId) {
  if (typeof window === "undefined") return;
  
  try {
    switch (collectionName) {
      case "dailySales":
        const invoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
        const invoiceIndex = invoices.findIndex(inv => inv.queueId === queueId);
        if (invoiceIndex !== -1) {
          invoices[invoiceIndex].id = firebaseId;
          invoices[invoiceIndex].isOffline = false;
          localStorage.setItem("offlineInvoices", JSON.stringify(invoices));
        }
        break;
        
      case "masrofat":
        const masrofat = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
        const masrofIndex = masrofat.findIndex(m => m.queueId === queueId);
        if (masrofIndex !== -1) {
          masrofat[masrofIndex].id = firebaseId;
          masrofat[masrofIndex].isOffline = false;
          localStorage.setItem("offlineMasrofat", JSON.stringify(masrofat));
        }
        break;
        
      case "wared":
        const wared = JSON.parse(localStorage.getItem("offlineWared") || "[]");
        const waredIndex = wared.findIndex(w => w.queueId === queueId);
        if (waredIndex !== -1) {
          wared[waredIndex].id = firebaseId;
          wared[waredIndex].isOffline = false;
          localStorage.setItem("offlineWared", JSON.stringify(wared));
        }
        break;
        
      case "lacosteProducts":
        const products = JSON.parse(localStorage.getItem("offlineProducts") || "[]");
        const productIndex = products.findIndex(p => p.queueId === queueId);
        if (productIndex !== -1) {
          products[productIndex].id = firebaseId;
          products[productIndex].isOffline = false;
          localStorage.setItem("offlineProducts", JSON.stringify(products));
          window.dispatchEvent(new CustomEvent("offlineProductSynced", { detail: { queueId, firebaseId } }));
        }
        break;
        
      case "cart":
        const cart = JSON.parse(localStorage.getItem("offlineCart") || "[]");
        const cartIndex = cart.findIndex(c => c.queueId === queueId);
        if (cartIndex !== -1) {
          cart[cartIndex].id = firebaseId;
          cart[cartIndex].isOffline = false;
          localStorage.setItem("offlineCart", JSON.stringify(cart));
          window.dispatchEvent(new CustomEvent("offlineCartItemSynced", { detail: { queueId, firebaseId } }));
        }
        break;
    }
  } catch (error) {
    console.error("Error updating local data with Firebase ID:", error);
  }
}

/**
 * Wrapper لإضافة مستند جديد - يعمل في Online و Offline
 * ✅ Online: يحفظ في Firebase والبيانات المحلية معاً (مزامنة فورية)
 * ✅ Offline: يحفظ في البيانات المحلية فقط (يتم المزامنة لاحقاً)
 */
export const offlineAdd = async (collectionName, data) => {
  // ✅ حفظ محلياً أولاً دائماً (للعرض الفوري)
  const queueId = offlineQueue.add({
    collectionName,
    action: "add",
    data
  });

  if (!queueId) {
    return { success: false, error: "Duplicate operation" };
  }

  // حفظ محلياً للعرض الفوري
  saveToLocalStorage(collectionName, "add", data, queueId);

  // إذا كان هناك اتصال، نحفظ في Firebase أيضاً (مزامنة فورية)
  if (isOnline()) {
    try {
      const result = await dataLayer.add(collectionName, data);
      
      // ✅ تحديث البيانات المحلية بالـ ID الحقيقي من Firebase
      updateLocalDataWithFirebaseId(collectionName, queueId, result.id);
      
      // تحديد العملية كمزامنة
      offlineQueue.markAsSynced(queueId);
      offlineQueue.remove(queueId);
      
      return { success: true, id: result.id, queueId, offline: false };
    } catch (error) {
      console.error("Error syncing to Firebase:", error);
      
      // ✅ حتى لو فشلت المزامنة، البيانات المحلية تم حفظها
      if (shouldQueueOnError(error)) {
        return { success: true, queueId, offline: true, error }; // ✅ success: true لأن الحفظ المحلي تم
      }
      
      // خطأ غير متوقع، نعيد العملية للقائمة
      return { success: true, queueId, offline: true, error };
    }
  }

  // ✅ بدون اتصال: البيانات المحلية تم حفظها، والعملية في القائمة للمزامنة لاحقاً
  return { success: true, queueId, offline: true };
};

/**
 * Wrapper لتحديث مستند - يعمل في Online و Offline
 * ✅ Online: يحدث Firebase والبيانات المحلية معاً (مزامنة فورية)
 * ✅ Offline: يحدث البيانات المحلية فقط (يتم المزامنة لاحقاً)
 */
export const offlineUpdate = async (collectionName, docId, data) => {
  // ✅ تحديث محلياً أولاً دائماً (للعرض الفوري)
  await updateLocalStorage(collectionName, docId, data);

  // ✅ التحقق من أن docId هو Firebase ID حقيقي وليس queueId
  let firebaseId = docId;
  
  // إذا كان docId يبدأ بـ "offline-" فهو queueId، نحتاج للبحث عن Firebase ID الحقيقي
  if (docId && docId.startsWith("offline-")) {
    if (typeof window !== "undefined") {
      try {
        // البحث عن Firebase ID الحقيقي من localStorage
        let foundId = null;
        
        switch (collectionName) {
          case "lacosteProducts":
            const products = JSON.parse(localStorage.getItem("offlineProducts") || "[]");
            const product = products.find(p => p.id === docId || p.queueId === docId);
            foundId = product?.id && !product.id.startsWith("offline-") ? product.id : null;
            break;
          case "dailySales":
            const invoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
            const invoice = invoices.find(inv => inv.id === docId || inv.queueId === docId);
            foundId = invoice?.id && !invoice.id.startsWith("offline-") ? invoice.id : null;
            break;
          case "masrofat":
            const masrofat = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
            const masrof = masrofat.find(m => m.id === docId || m.queueId === docId);
            foundId = masrof?.id && !masrof.id.startsWith("offline-") ? masrof.id : null;
            break;
          case "cart":
            const cart = JSON.parse(localStorage.getItem("offlineCart") || "[]");
            const cartItem = cart.find(c => c.id === docId || c.queueId === docId);
            foundId = cartItem?.id && !cartItem.id.startsWith("offline-") ? cartItem.id : null;
            break;
          case "wared":
            const wared = JSON.parse(localStorage.getItem("offlineWared") || "[]");
            const waredItem = wared.find(w => w.id === docId || w.queueId === docId);
            foundId = waredItem?.id && !waredItem.id.startsWith("offline-") ? waredItem.id : null;
            break;
        }
        
        // إذا لم نجد Firebase ID حقيقي، المستند لم يتم مزامنته بعد
        if (!foundId) {
          // ✅ إضافة العملية للقائمة للمزامنة لاحقاً (بعد أن يتم مزامنة الإضافة)
          const queueId = offlineQueue.add({
            collectionName,
            action: "update",
            docId, // نحتفظ بـ queueId الأصلي
            data
          });
          
          return { success: true, queueId, offline: true, error: "Document not synced yet" };
        }
        
        firebaseId = foundId;
      } catch (error) {
        console.error("Error finding Firebase ID:", error);
      }
    }
  }

  // إضافة العملية للقائمة للمزامنة مع Firebase
  const queueId = offlineQueue.add({
    collectionName,
    action: "update",
    docId: firebaseId, // استخدام Firebase ID الحقيقي
    data
  });

  if (!queueId) {
    // إذا كانت العملية مكررة، نعيد success لأن التحديث المحلي تم بالفعل
    return { success: true, queueId: null, offline: true, error: "Duplicate operation" };
  }

  // إذا كان هناك اتصال، نحدث Firebase أيضاً (مزامنة فورية)
  if (isOnline()) {
    try {
      await dataLayer.update(collectionName, firebaseId, data);
      offlineQueue.markAsSynced(queueId);
      offlineQueue.remove(queueId);
      return { success: true, queueId, offline: false };
    } catch (error) {
      console.error("Error syncing update:", error);
      
      // ✅ إذا كان الخطأ "not-found"، المستند لم يتم مزامنته بعد
      if (error.code === "not-found" || error.message?.includes("No document to update")) {
        // ✅ نحتفظ بالعملية في القائمة للمزامنة لاحقاً
        return { success: true, queueId, offline: true, error: "Document not synced yet" };
      }
      
      // ✅ حتى لو فشلت المزامنة، التحديث المحلي تم بالفعل
      if (shouldQueueOnError(error)) {
        return { success: true, queueId, offline: true, error }; // ✅ success: true لأن التحديث المحلي تم
      }
      
      // خطأ غير متوقع، نعيد العملية للقائمة
      return { success: true, queueId, offline: true, error };
    }
  }

  // ✅ بدون اتصال: التحديث المحلي تم، والعملية في القائمة للمزامنة لاحقاً
  return { success: true, queueId, offline: true };
};

/**
 * Wrapper لحذف مستند - يعمل في Online و Offline
 * ✅ Online: يحذف من Firebase والبيانات المحلية معاً (مزامنة فورية)
 * ✅ Offline: يحذف من البيانات المحلية فقط (يتم المزامنة لاحقاً)
 */
export const offlineDelete = async (collectionName, docId) => {
  // ✅ لو docId هو queueId نحاول نحدد Firebase ID الحقيقي قبل حذف Firestore
  let firebaseId = docId;
  if (docId && docId.startsWith("offline-") && typeof window !== "undefined") {
    try {
      let foundId = null;
      switch (collectionName) {
        case "lacosteProducts": {
          const products = JSON.parse(localStorage.getItem("offlineProducts") || "[]");
          const product = products.find((p) => p.id === docId || p.queueId === docId);
          foundId = product?.id && !product.id.startsWith("offline-") ? product.id : null;
          break;
        }
        case "dailySales": {
          const invoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
          const invoice = invoices.find((inv) => inv.id === docId || inv.queueId === docId);
          foundId = invoice?.id && !invoice.id.startsWith("offline-") ? invoice.id : null;
          break;
        }
        case "masrofat": {
          const masrofat = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
          const masrof = masrofat.find((m) => m.id === docId || m.queueId === docId);
          foundId = masrof?.id && !masrof.id.startsWith("offline-") ? masrof.id : null;
          break;
        }
        case "cart": {
          const cart = JSON.parse(localStorage.getItem("offlineCart") || "[]");
          const cartItem = cart.find((c) => c.id === docId || c.queueId === docId);
          foundId = cartItem?.id && !cartItem.id.startsWith("offline-") ? cartItem.id : null;
          break;
        }
        case "wared": {
          const wared = JSON.parse(localStorage.getItem("offlineWared") || "[]");
          const waredItem = wared.find((w) => w.id === docId || w.queueId === docId);
          foundId = waredItem?.id && !waredItem.id.startsWith("offline-") ? waredItem.id : null;
          break;
        }
      }
      if (foundId) firebaseId = foundId;
    } catch (e) {
      console.error("Error resolving Firebase ID for delete:", e);
    }
  }

  // ✅ حذف محلياً أولاً دائماً (للعرض الفوري)
  removeFromLocalStorage(collectionName, docId);
  
  if (isOnline()) {
    // ✅ Online: حذف من Firebase أيضاً (مزامنة فورية)
    try {
      await dataLayer.delete(collectionName, firebaseId);
      
      // ✅ الحذف تم من Firebase والبيانات المحلية معاً
      return { success: true, queueId: null, offline: false };
    } catch (error) {
      console.error("Error deleting from Firebase:", error);
      
      // ✅ حتى لو فشل الحذف من Firebase، الحذف المحلي تم بالفعل
      // نضيف العملية للقائمة للمزامنة لاحقاً
      const queueId = offlineQueue.add({
        collectionName,
        action: "delete",
        docId: firebaseId
      });
      
      if (shouldQueueOnError(error)) {
        return { success: true, queueId, offline: true, error }; // ✅ success: true لأن الحذف المحلي تم
      }
      
      // خطأ غير متوقع، نعيد العملية للقائمة
      return { success: true, queueId, offline: true, error };
    }
  } else {
    // ✅ Offline: حذف من البيانات المحلية فقط
    // إضافة العملية للقائمة للمزامنة مع Firebase عند عودة الاتصال
    const queueId = offlineQueue.add({
      collectionName,
      action: "delete",
      docId: firebaseId
    });

    if (!queueId) {
      // إذا كانت العملية مكررة، نعيد success لأن الحذف المحلي تم بالفعل
      return { success: true, queueId: null, offline: true, error: "Duplicate operation" };
    }

    return { success: true, queueId, offline: true };
  }
};

/**
 * Export helper function for updating local data with Firebase ID
 */
export { updateLocalDataWithFirebaseId };

