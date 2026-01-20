/**
 * Unified DataLayer - Single interface for all data operations
 * 
 * This module provides a unified API for all database operations.
 * Currently uses Firebase SDK directly, but can be extended with
 * offline support, caching, and other features in the future.
 * 
 * @module lib/DataLayer
 */

import {
  collection as firestoreCollection,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  doc as firestoreDoc,
} from "firebase/firestore";
import { db } from "@/app/firebase";

/**
 * DataLayer - Unified interface for all data operations
 */
class DataLayer {
  /**
   * Add a new document to a collection
   * @param {string} collectionName - Name of the collection
   * @param {object} data - Document data to add
   * @returns {Promise<{id: string}>} - Promise resolving to the document ID
   */
  async add(collectionName, data) {
    try {
      const docRef = await addDoc(firestoreCollection(db, collectionName), data);
      return { id: docRef.id };
    } catch (error) {
      console.error(`DataLayer.add error for collection "${collectionName}":`, error);
      throw error;
    }
  }

  /**
   * Update an existing document
   * @param {string} collectionName - Name of the collection
   * @param {string} docId - Document ID to update
   * @param {object} data - Data to update (partial update)
   * @returns {Promise<void>}
   */
  async update(collectionName, docId, data) {
    try {
      const docRef = firestoreDoc(db, collectionName, docId);
      await updateDoc(docRef, data);
    } catch (error) {
      console.error(
        `DataLayer.update error for collection "${collectionName}" docId "${docId}":`,
        error
      );
      throw error;
    }
  }

  /**
   * Delete a document
   * @param {string} collectionName - Name of the collection
   * @param {string} docId - Document ID to delete
   * @returns {Promise<void>}
   */
  async delete(collectionName, docId) {
    try {
      const docRef = firestoreDoc(db, collectionName, docId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error(
        `DataLayer.delete error for collection "${collectionName}" docId "${docId}":`,
        error
      );
      throw error;
    }
  }

  /**
   * Get documents using a Firestore query
   * @param {Query} query - Firestore query object (from query(), collection(), etc.)
   * @returns {Promise<Array<{id: string, data: object}>>} - Promise resolving to array of documents
   */
  async get(query) {
    try {
      const querySnapshot = await getDocs(query);
      return querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
    } catch (error) {
      console.error("DataLayer.get error:", error);
      throw error;
    }
  }

  /**
   * Get a single document by reference
   * @param {string} collectionName - Name of the collection
   * @param {string} docId - Document ID
   * @returns {Promise<{id: string, data: object} | null>} - Promise resolving to document or null
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
        `DataLayer.getById error for collection "${collectionName}" docId "${docId}":`,
        error
      );
      throw error;
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
const dataLayer = new DataLayer();
export default dataLayer;

// Also export the class for testing or advanced usage
export { DataLayer };

