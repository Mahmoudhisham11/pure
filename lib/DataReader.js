/**
 * Unified DataReader - Single interface for all data read operations
 * 
 * This module provides a unified API for all database read operations.
 * Currently uses Firebase SDK directly, but can be extended with
 * caching, offline support, and other features in the future.
 * 
 * @module lib/DataReader
 */

import {
  collection as firestoreCollection,
  getDocs,
  getDoc,
  onSnapshot as firestoreOnSnapshot,
  doc as firestoreDoc,
} from "firebase/firestore";
import { db } from "@/app/firebase";

/**
 * DataReader - Unified interface for all data read operations
 */
class DataReader {
  /**
   * Get documents using a Firestore query
   * @param {Query} query - Firestore query object (from query(), collection(), etc.)
   * @returns {Promise<Array<{id: string, ...data}>>} - Promise resolving to array of documents
   */
  async get(query) {
    try {
      const querySnapshot = await getDocs(query);
      return querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
    } catch (error) {
      console.error("DataReader.get error:", error);
      throw error;
    }
  }

  /**
   * Get a single document by collection name and document ID
   * @param {string} collectionName - Name of the collection
   * @param {string} docId - Document ID
   * @returns {Promise<{id: string, ...data} | null>} - Promise resolving to document or null
   */
  async getById(collectionName, docId) {
    try {
      const docRef = firestoreDoc(db, collectionName, docId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data(),
        };
      }
      return null;
    } catch (error) {
      console.error(
        `DataReader.getById error for collection "${collectionName}" docId "${docId}":`,
        error
      );
      throw error;
    }
  }

  /**
   * Listen to real-time updates for a query
   * @param {Query} query - Firestore query object
   * @param {Function} callback - Callback function that receives (docs, error)
   * @returns {Function} - Unsubscribe function
   */
  onSnapshot(query, callback) {
    try {
      return firestoreOnSnapshot(
        query,
        (snapshot) => {
          const docs = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));
          callback(docs, null);
        },
        (error) => {
          console.error("DataReader.onSnapshot error:", error);
          callback([], error);
        }
      );
    } catch (error) {
      console.error("DataReader.onSnapshot setup error:", error);
      callback([], error);
      // Return a no-op unsubscribe function
      return () => {};
    }
  }

  /**
   * Get a collection reference (helper for building queries)
   * @param {string} collectionName - Name of the collection
   * @returns {CollectionReference} - Firestore collection reference
   */
  collection(collectionName) {
    return firestoreCollection(db, collectionName);
  }

  /**
   * Get a document reference (helper for building queries)
   * @param {string} collectionName - Name of the collection
   * @param {string} docId - Document ID
   * @returns {DocumentReference} - Firestore document reference
   */
  doc(collectionName, docId) {
    return firestoreDoc(db, collectionName, docId);
  }
}

// Export a singleton instance
const dataReader = new DataReader();
export default dataReader;

// Also export the class for testing or advanced usage
export { DataReader };



