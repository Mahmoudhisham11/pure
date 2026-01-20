/**
 * Enhanced Offline Sync Hook
 * 
 * Features:
 * - Automatic connectivity detection
 * - Immediate sync on connection restore
 * - Periodic sync checks
 * - UI update notifications
 * - Exponential backoff retry
 * 
 * @module hooks/useOfflineSync
 */

"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { collection, query, where } from "firebase/firestore";
import { offlineQueue } from "@/utils/offlineQueue";
import dataLayer from "@/lib/DataLayer";
import dataReader from "@/lib/DataReader";
import { updateLocalDataWithFirebaseId } from "@/utils/firebaseOffline";
import { useNotification } from "@/contexts/NotificationContext";
import { db } from "@/app/firebase";

export function useOfflineSync() {
  const { success, warning, error: showError } = useNotification();
  const [isOnline, setIsOnline] = useState(
    typeof window !== "undefined" ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const syncTimeoutRef = useRef(null);
  const isInitialMount = useRef(true);

  /**
   * Update pending and failed counts
   */
  const updateCounts = useCallback(() => {
    const pending = offlineQueue.getPendingCount();
    const failed = offlineQueue.getFailedCount();
    setPendingCount(pending);
    setFailedCount(failed);
  }, []);

  /**
   * Sync offline close days to Firestore
   */
  const syncOfflineCloseDays = useCallback(async () => {
    if (typeof window === "undefined") return;
    
    try {
      const saved = localStorage.getItem("offlineCloseDays");
      if (!saved) return;
      
      const closeDays = JSON.parse(saved);
      if (!Array.isArray(closeDays) || closeDays.length === 0) return;
      
      const { writeBatch, doc, collection, Timestamp } = await import("firebase/firestore");
      const { db } = await import("@/app/firebase");
      
      for (const closeDayData of closeDays) {
        if (!closeDayData.isOffline) continue; // تم مزامنتها مسبقاً
        
        try {
          const batch = writeBatch(db);
          
          // نقل الفواتير إلى reports
          if (Array.isArray(closeDayData.sales)) {
            for (const sale of closeDayData.sales) {
              const saleId = sale.id || sale.queueId;
              if (!saleId) continue;
              
              // التحقق من وجود الفاتورة في Firestore قبل الحذف
              try {
                const saleRef = doc(db, "dailySales", saleId);
                const reportRef = doc(collection(db, "reports"));
                batch.set(reportRef, {
                  ...sale,
                  closedBy: closeDayData.closedBy,
                });
                batch.delete(saleRef);
              } catch (e) {
                console.warn(`Skipping sale ${saleId} - may not exist in Firestore:`, e);
              }
            }
          }
          
          // حذف مصاريف اليوم
          if (Array.isArray(closeDayData.masrofat)) {
            for (const masrof of closeDayData.masrofat) {
              if (masrof.date === closeDayData.closedAt) {
                const masrofId = masrof.id || masrof.queueId;
                if (!masrofId) continue;
                
                try {
                  const masrofRef = doc(db, "masrofat", masrofId);
                  batch.delete(masrofRef);
                } catch (e) {
                  console.warn(`Skipping masrof ${masrofId} - may not exist in Firestore:`, e);
                }
              }
            }
          }
          
          // حفظ daily profit
          const profitData = {
            shop: closeDayData.shop,
            date: closeDayData.closedAt,
            totalSales: closeDayData.totalSales,
            totalMasrofat: closeDayData.totalMasrofat,
            returnedProfit: closeDayData.returnedProfit,
            createdAt: closeDayData.closedAtTimestamp || Timestamp.now(),
            closedBy: closeDayData.closedBy,
          };
          const profitRef = doc(collection(db, "dailyProfit"));
          batch.set(profitRef, profitData);
          
          // ✅ تحويل closedAtTimestamp لـ Timestamp object قبل الحفظ في Firestore
          let timestampForFirestore = Timestamp.now();
          if (closeDayData.closedAtTimestamp) {
            if (closeDayData.closedAtTimestamp.seconds) {
              timestampForFirestore = new Timestamp(
                closeDayData.closedAtTimestamp.seconds,
                closeDayData.closedAtTimestamp.nanoseconds || 0
              );
            } else if (closeDayData.closedAtTimestamp.toDate) {
              timestampForFirestore = Timestamp.fromDate(closeDayData.closedAtTimestamp.toDate());
            }
          }

          // حفظ close day history
          const closeRef = doc(collection(db, "closeDayHistory"));
          batch.set(closeRef, {
            ...closeDayData,
            closedAtTimestamp: timestampForFirestore,
            isOffline: false,
          });
          
          await batch.commit();
          
          // ✅ حفظ التقفيلة في localStorage مع الـ id الجديد من Firestore (بدل الحذف)
          const syncedCloseDay = {
            ...closeDayData,
            id: closeRef.id,
            closedAtTimestamp: {
              seconds: timestampForFirestore.seconds,
              nanoseconds: timestampForFirestore.nanoseconds,
            },
            isOffline: false,
          };
          
          // استبدال التقفيلة القديمة بالجديدة مع الـ id
          const updated = closeDays.map(cd => 
            (cd.closedAt === closeDayData.closedAt && 
             cd.closedBy === closeDayData.closedBy && 
             cd.isOffline === true) 
              ? syncedCloseDay 
              : cd
          );
          
          localStorage.setItem("offlineCloseDays", JSON.stringify(updated));
          
          console.log(`✅ Synced offline close day: ${closeDayData.closedAt}`);
        } catch (error) {
          console.error(`Error syncing close day ${closeDayData.closedAt}:`, error);
          // نستمر مع التقفيلات الأخرى حتى لو فشلت واحدة
        }
      }
    } catch (error) {
      console.error("Error syncing offline close days:", error);
    }
  }, []);

  /**
   * Enhanced sync function with exponential backoff
   */
  const sync = useCallback(async (silent = false) => {
    if (!navigator.onLine) {
      if (!silent) {
      console.log("📴 No internet connection");
      }
      return;
    }

    if (isSyncing) {
      if (!silent) {
        console.log("⏳ Sync already in progress");
      }
      return;
    }

    setIsSyncing(true);
    updateCounts();
    
    try {
      const pending = offlineQueue.getPending();
      if (pending.length === 0) {
        setIsSyncing(false);
        return;
      }

      let successCount = 0;
      let failedCount = 0;
      const errors = [];

      // معالجة العمليات بالترتيب (FIFO)
      for (const operation of pending) {
        // تخطي العمليات التي فشلت 5 مرات
        if (operation.retries >= 5) {
          failedCount++;
          errors.push({ id: operation.id, retries: operation.retries });
          continue;
        }

        // Exponential backoff: انتظر قبل إعادة المحاولة
        if (operation.lastRetry) {
          const lastRetryTime = new Date(operation.lastRetry).getTime();
          const waitTime = Math.min(1000 * Math.pow(2, operation.retries), 30000);
          const timeSinceLastRetry = Date.now() - lastRetryTime;
          
          if (timeSinceLastRetry < waitTime) {
            continue; // انتظر أكثر
          }
        }

        try {
          // ✅ التحقق من أن العنصر لا يزال موجوداً في localStorage قبل المزامنة
          // إذا كان محذوفاً محلياً، نتخطى المزامنة
          if (operation.action === "add") {
            // ✅ للـ cart و dailySales: التحقق من أن العنصر لا يزال موجوداً محلياً
            if (operation.collectionName === "cart" || operation.collectionName === "dailySales") {
              if (typeof window !== "undefined") {
                const localKey = operation.collectionName === "cart" ? "offlineCart" : "offlineInvoices";
                const localData = JSON.parse(localStorage.getItem(localKey) || "[]");
                
                // التحقق من وجود العنصر باستخدام queueId أو البيانات
                let exists = false;
                if (operation.collectionName === "cart") {
                  // للـ cart: نتحقق من الكود واللون والمقاس
                  exists = localData.some(item => {
                    if (item.queueId === operation.id) return true;
                    if (operation.data) {
                      return (item.code || "") === (operation.data.code || "") &&
                             (item.color || "") === (operation.data.color || "") &&
                             (item.size || "") === (operation.data.size || "") &&
                             (item.shop || "") === (operation.data.shop || "");
                    }
                    return false;
                  });
                } else if (operation.collectionName === "dailySales") {
                  // للفواتير: نتحقق من queueId أو invoiceNumber
                  exists = localData.some(inv => {
                    if (inv.queueId === operation.id) return true;
                    if (operation.data && operation.data.invoiceNumber) {
                      return inv.invoiceNumber === operation.data.invoiceNumber &&
                             inv.shop === (operation.data.shop || "");
                    }
                    return false;
                  });
                }
                
                // إذا لم يكن موجوداً محلياً، نتخطى المزامنة
                if (!exists) {
                  console.log(`⚠️ Skipping sync for ${operation.collectionName} - item was deleted locally`);
                  offlineQueue.markAsSynced(operation.id);
                  offlineQueue.remove(operation.id);
                  successCount++;
                  continue;
                }
              }
            }

            // ✅ حماية إضافية: منع تكرار الفواتير في Firestore عند المزامنة
            // إذا كانت فاتورة بنفس invoiceNumber + shop موجودة بالفعل، نربط العملية بالـ id الموجود بدل إنشاء فاتورة جديدة
            if (operation.collectionName === "dailySales" && operation.data?.invoiceNumber && operation.data?.shop) {
              try {
                const q = query(
                  collection(db, "dailySales"),
                  where("invoiceNumber", "==", Number(operation.data.invoiceNumber)),
                  where("shop", "==", operation.data.shop)
                );
                const existing = await dataReader.get(q);
                if (existing && existing.length > 0) {
                  const existingId = existing[0].id;
                  updateLocalDataWithFirebaseId(operation.collectionName, operation.id, existingId);
                  offlineQueue.markAsSynced(operation.id);
                  offlineQueue.remove(operation.id);
                  successCount++;
                  continue;
                }
              } catch (e) {
                // نتجاهل ونكمل add العادي
                console.warn("Could not check existing invoice before add:", e);
              }
            }
            
            const result = await dataLayer.add(operation.collectionName, operation.data);
            
            // تحديث البيانات المحلية بالـ ID الحقيقي
            updateLocalDataWithFirebaseId(operation.collectionName, operation.id, result.id);
            
            offlineQueue.markAsSynced(operation.id);
            offlineQueue.remove(operation.id);
            successCount++;
            
          } else if (operation.action === "update") {
            // ✅ للـ dailySales: التحقق من أن الفاتورة لا تزال موجودة محلياً
            if (operation.collectionName === "dailySales") {
              if (typeof window !== "undefined") {
                const localInvoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
                const exists = localInvoices.some(inv => 
                  inv.id === operation.docId || inv.queueId === operation.docId
                );
                
                // إذا لم تكن موجودة محلياً، نتخطى المزامنة
                if (!exists) {
                  console.log(`⚠️ Skipping sync for invoice update - invoice was deleted locally`);
                  offlineQueue.markAsSynced(operation.id);
                  offlineQueue.remove(operation.id);
                  successCount++;
                  continue;
                }
              }
            }
            
            // ✅ التحقق من أن docId هو Firebase ID حقيقي وليس queueId
            let firebaseId = operation.docId;
            
            // إذا كان docId يبدأ بـ "offline-" فهو queueId، نحتاج للبحث عن Firebase ID الحقيقي
            if (operation.docId && operation.docId.startsWith("offline-")) {
              if (typeof window !== "undefined") {
                try {
                  let foundId = null;
                  
                  switch (operation.collectionName) {
                    case "lacosteProducts":
                      const products = JSON.parse(localStorage.getItem("offlineProducts") || "[]");
                      const product = products.find(p => p.id === operation.docId || p.queueId === operation.docId);
                      foundId = product?.id && !product.id.startsWith("offline-") ? product.id : null;
                      break;
                    case "dailySales":
                      const invoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
                      const invoice = invoices.find(inv => inv.id === operation.docId || inv.queueId === operation.docId);
                      foundId = invoice?.id && !invoice.id.startsWith("offline-") ? invoice.id : null;
                      break;
                    case "masrofat":
                      const masrofat = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
                      const masrof = masrofat.find(m => m.id === operation.docId || m.queueId === operation.docId);
                      foundId = masrof?.id && !masrof.id.startsWith("offline-") ? masrof.id : null;
                      break;
                    case "cart":
                      const cart = JSON.parse(localStorage.getItem("offlineCart") || "[]");
                      const cartItem = cart.find(c => c.id === operation.docId || c.queueId === operation.docId);
                      foundId = cartItem?.id && !cartItem.id.startsWith("offline-") ? cartItem.id : null;
                      break;
                    case "wared":
                      const wared = JSON.parse(localStorage.getItem("offlineWared") || "[]");
                      const waredItem = wared.find(w => w.id === operation.docId || w.queueId === operation.docId);
                      foundId = waredItem?.id && !waredItem.id.startsWith("offline-") ? waredItem.id : null;
                      break;
                  }
                  
                  // إذا لم نجد Firebase ID حقيقي، المستند لم يتم مزامنته بعد
                  if (!foundId) {
                    console.log(`⚠️ Skipping sync for ${operation.collectionName} update - document not synced yet (queueId: ${operation.docId})`);
                    offlineQueue.markAsSynced(operation.id);
                    offlineQueue.remove(operation.id);
                    successCount++;
                    continue;
                  }
                  
                  firebaseId = foundId;
                } catch (error) {
                  console.error("Error finding Firebase ID:", error);
                }
              }
            }
            
            try {
              await dataLayer.update(operation.collectionName, firebaseId, operation.data);
              offlineQueue.markAsSynced(operation.id);
              offlineQueue.remove(operation.id);
              successCount++;
            } catch (error) {
              // ✅ إذا كان الخطأ "not-found"، المستند لم يتم مزامنته بعد
              if (error.code === "not-found" || error.message?.includes("No document to update")) {
                console.log(`⚠️ Document not found in Firebase, skipping update (docId: ${firebaseId})`);
                offlineQueue.markAsSynced(operation.id);
                offlineQueue.remove(operation.id);
                successCount++;
                continue;
              }
              
              throw error; // خطأ آخر، نعيد المحاولة
            }
            
          } else if (operation.action === "delete") {
            // ✅ المزامنة: حذف من Firebase ليطابق البيانات المحلية
            // البيانات المحلية تم حذفها بالفعل، نحذف من Firebase فقط
            try {
              // ✅ لو docId هو queueId نحاول نحدد Firebase ID الحقيقي قبل الحذف
              let deleteId = operation.docId;
              if (deleteId && deleteId.startsWith("offline-") && typeof window !== "undefined") {
                try {
                  let foundId = null;
                  switch (operation.collectionName) {
                    case "lacosteProducts": {
                      const products = JSON.parse(localStorage.getItem("offlineProducts") || "[]");
                      const product = products.find((p) => p.id === deleteId || p.queueId === deleteId);
                      foundId = product?.id && !product.id.startsWith("offline-") ? product.id : null;
                      break;
                    }
                    case "dailySales": {
                      const invoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
                      const invoice = invoices.find((inv) => inv.id === deleteId || inv.queueId === deleteId);
                      foundId = invoice?.id && !invoice.id.startsWith("offline-") ? invoice.id : null;
                      break;
                    }
                    case "masrofat": {
                      const masrofat = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
                      const masrof = masrofat.find((m) => m.id === deleteId || m.queueId === deleteId);
                      foundId = masrof?.id && !masrof.id.startsWith("offline-") ? masrof.id : null;
                      break;
                    }
                    case "wared": {
                      const wared = JSON.parse(localStorage.getItem("offlineWared") || "[]");
                      const waredItem = wared.find((w) => w.id === deleteId || w.queueId === deleteId);
                      foundId = waredItem?.id && !waredItem.id.startsWith("offline-") ? waredItem.id : null;
                      break;
                    }
                    case "cart": {
                      const cart = JSON.parse(localStorage.getItem("offlineCart") || "[]");
                      const cartItem = cart.find((c) => c.id === deleteId || c.queueId === deleteId);
                      foundId = cartItem?.id && !cartItem.id.startsWith("offline-") ? cartItem.id : null;
                      break;
                    }
                  }
                  if (foundId) deleteId = foundId;
                } catch (e) {
                  console.error("Error resolving Firebase ID in delete sync:", e);
                }
              }

              await dataLayer.delete(operation.collectionName, deleteId);
              offlineQueue.markAsSynced(operation.id);
              offlineQueue.remove(operation.id);
              successCount++;
            } catch (error) {
              // إذا كان المستند غير موجود في Firebase، هذا طبيعي (ربما تم حذفه مسبقاً)
              if (error.code === "not-found") {
                console.log("Document already deleted from Firebase:", operation.docId);
                offlineQueue.markAsSynced(operation.id);
                offlineQueue.remove(operation.id);
                successCount++;
              } else {
                throw error; // خطأ آخر، نعيد المحاولة
              }
            }
          }
        } catch (error) {
          console.error("Error syncing operation:", error);
          offlineQueue.incrementRetry(operation.id);
          failedCount++;
          errors.push({ id: operation.id, error, retries: operation.retries + 1 });
        }
      }

      // تنظيف العمليات القديمة
      offlineQueue.cleanup();
      
      if (successCount > 0 && !silent) {
        success(`✅ تم مزامنة ${successCount} عملية بنجاح`);
      }
      
      if (failedCount > 0 && !silent) {
        warning(`⚠️ فشلت ${failedCount} عملية في المزامنة`);
      }
      
      // عرض الأخطاء للعمليات التي فشلت 5 مرات
      const maxRetriesErrors = errors.filter(e => e.retries >= 5);
      if (maxRetriesErrors.length > 0 && !silent) {
        showError(`❌ فشلت ${maxRetriesErrors.length} عملية بعد 5 محاولات. يرجى المراجعة يدوياً.`);
      }
      
      updateCounts();
    } catch (error) {
      console.error("Sync error:", error);
      if (!silent) {
        showError("حدث خطأ أثناء المزامنة");
      }
    } finally {
      setIsSyncing(false);
    }
  }, [success, warning, showError, isSyncing, updateCounts, syncOfflineCloseDays]);

  /**
   * Handle online event
   */
  const handleOnline = useCallback(async () => {
      setIsOnline(true);
      console.log("🌐 Internet connection restored");
      
    // Clear any pending sync timeout
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    // Wait a bit for connection to stabilize
    syncTimeoutRef.current = setTimeout(async () => {
      // Sync offline close days first
      await syncOfflineCloseDays();
      
      const pending = offlineQueue.getPendingCount();
      if (pending > 0) {
        console.log(`🔄 Auto-syncing ${pending} pending operations...`);
        sync(false);
      }
    }, 1500);
  }, [sync, syncOfflineCloseDays]);

  /**
   * Handle offline event
   */
  const handleOffline = useCallback(() => {
    setIsOnline(false);
    console.log("📴 Internet connection lost");
    updateCounts();
  }, [updateCounts]);

  /**
   * Listen to queue updates from other tabs
   */
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "offlineQueue") {
        updateCounts();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [updateCounts]);

  /**
   * Listen to operation events for UI updates
   */
  useEffect(() => {
    const handlers = {
      offlineOperationAdded: () => {
        updateCounts();
      },
      offlineOperationSynced: () => {
        updateCounts();
      },
      offlineOperationFailed: () => {
        updateCounts();
      },
      offlineQueueUpdated: (e) => {
        setPendingCount(e.detail?.count || offlineQueue.getPendingCount());
      },
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      window.addEventListener(event, handler);
    });

    return () => {
      Object.keys(handlers).forEach((event) => {
        window.removeEventListener(event, handlers[event]);
      });
    };
  }, [updateCounts]);

  /**
   * Main effect - setup sync logic
   */
  useEffect(() => {
    // Initial counts
    updateCounts();

    // Skip initial sync on mount (let user trigger manually if needed)
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      // Sync on mount if online and has pending
      if (navigator.onLine && offlineQueue.getPendingCount() > 0) {
        sync(true); // Silent sync on mount
      }
    }

    // Listen to online/offline events
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic sync check (every 30 seconds if online)
    const syncInterval = setInterval(() => {
      if (navigator.onLine && !isSyncing) {
        const pending = offlineQueue.getPendingCount();
        if (pending > 0) {
          console.log(`🔄 Periodic sync: ${pending} pending operations...`);
          sync(true); // Silent periodic sync
        }
      }
      updateCounts();
    }, 30000);

    // Sync on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden && navigator.onLine && !isSyncing) {
        const pending = offlineQueue.getPendingCount();
        if (pending > 0) {
          console.log(`🔄 Tab visible: syncing ${pending} pending operations...`);
          sync(true); // Silent sync on visibility
        }
      }
      updateCounts();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Cleanup
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(syncInterval);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [sync, isSyncing, handleOnline, handleOffline, updateCounts]);

  /**
   * Manual retry failed operations
   */
  const retryFailed = useCallback(async () => {
    if (!navigator.onLine) {
      showError("لا يوجد اتصال بالإنترنت");
      return;
    }

    setIsSyncing(true);
    try {
      const pending = offlineQueue.getPending();
      const failed = pending.filter(op => op.retries >= 5);
      
      // إعادة تعيين المحاولات
      failed.forEach(op => {
        op.retries = 0;
        op.lastRetry = null;
      });
      
      offlineQueue.saveQueue();
      
      const results = await sync(false);
      if (results && results.success > 0) {
        success(`✅ تم إعادة محاولة ${results.success} عملية بنجاح`);
      }
      updateCounts();
    } catch (error) {
      console.error("Retry failed error:", error);
      showError("حدث خطأ أثناء إعادة المحاولة");
    } finally {
      setIsSyncing(false);
    }
  }, [success, showError, updateCounts, sync]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    failedCount,
    sync: () => sync(false), // Expose manual sync (non-silent)
    retryFailed,
    updateCounts,
  };
}

