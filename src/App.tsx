/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StatsCard from './components/StatsCard';
import { ActivityBarChart, DistributionPieChart } from './components/Charts';
import KaryawanView from './components/KaryawanView';
import SertifikatView from './components/SertifikatView';
import DashboardView from './components/DashboardView';
import SettingsView from './components/SettingsView';
import PrintModal from './components/PrintModal';
import PrintReport from './components/PrintReport';
import EditCertModal from './components/EditCertModal';
import EditEmployeeModal from './components/EditEmployeeModal';
import NotificationToast from './components/NotificationToast';
import ConfirmModal from './components/ConfirmModal';
import { cn } from './lib/utils';
import { FileText, Calendar, Clock, AlertTriangle, LogIn, Award, BadgeCheck, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  setDoc,
  getDocs,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './lib/firebase';
import LandingView from './components/LandingView';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [themeColor, setThemeColor] = useState('bg-blue-600');
  const [sidebarBgImage, setSidebarBgImage] = useState<string | null>(null);
  const [certificatesData, setCertificatesData] = useState<any[]>([]);
  const [employeesData, setEmployeesData] = useState<any[]>([]);
  const [editingCert, setEditingCert] = useState<any | null>(null);
  const [editingEmp, setEditingEmp] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditEmpModalOpen, setIsEditEmpModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [toastNotifications, setToastNotifications] = useState<any[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [appToast, setAppToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Confirm Modal State
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Show app toast helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setAppToast({ message, type });
    setTimeout(() => setAppToast(null), 3000);
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const certsQuery = query(
      collection(db, 'certificates'), 
      where('ownerId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );
    const unsubscribeCerts = onSnapshot(certsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setCertificatesData(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'certificates'));

    const empQuery = query(
      collection(db, 'employees'), 
      where('ownerId', '==', user.uid),
      orderBy('name', 'asc')
    );
    const unsubscribeEmps = onSnapshot(empQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setEmployeesData(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'employees'));

    return () => {
      unsubscribeCerts();
      unsubscribeEmps();
    };
  }, [user]);

  // Handle auto-download from QR code scan
  useEffect(() => {
    if (certificatesData.length === 0) return;
    
    const params = new URLSearchParams(window.location.search);
    const downloadId = params.get('downloadCertId');
    
    if (downloadId) {
      const targetCert = certificatesData.find(c => c.id === downloadId);
      if (targetCert) {
        handleDownloadPDF(targetCert);
        // Clear the URL parameter so it doesn't download again on refresh
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    }
  }, [certificatesData]);

  // Expiration Notification Logic
  useEffect(() => {
    if (certificatesData.length === 0) return;

    const now = new Date();
    const parseDate = (dateStr: string) => {
      if (!dateStr) return null;
      try {
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        const parts = dateStr.split(' ');
        if (parts.length < 3) return null;
        const day = parseInt(parts[0]);
        const monthMap: Record<string, number> = {
          'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'Mei': 4, 'Jun': 5, 'Jul': 6, 'Agu': 7, 'Sep': 8, 'Okt': 9, 'Nov': 10, 'Des': 11,
          'May': 4, 'Aug': 7, 'Oct': 9, 'Dec': 11
        };
        const month = monthMap[parts[1]] ?? 0;
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
      } catch { return null; }
    };

    const dismissedIds = JSON.parse(localStorage.getItem('dismissedNotifications') || '[]');
    
    const newNotifications = certificatesData.filter(c => {
      const d = parseDate(c.expiryDate);
      if (!d) return false;
      const diffTime = d.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 && diffDays <= 7 && !dismissedIds.includes(c.id);
    }).map(c => ({
      id: c.id,
      certName: c.name,
      owner: c.owner,
      expiryDate: c.expiryDate
    }));

    setNotifications(newNotifications);

    // Filter for TOASTS (only show ones we haven't seen in this session)
    const seenInSession = toastNotifications.map(t => t.id);
    const untrashedNew = newNotifications.filter(n => !seenInSession.includes(n.id));
    
    if (untrashedNew.length > 0) {
      setToastNotifications(prev => [...prev, ...untrashedNew]);
    }
  }, [certificatesData]);

  const handleDismissNotification = (id: string) => {
    const dismissedIds = JSON.parse(localStorage.getItem('dismissedNotifications') || '[]');
    const updated = [...dismissedIds, id];
    localStorage.setItem('dismissedNotifications', JSON.stringify(updated));
    setNotifications(prev => prev.filter(n => n.id !== id));
    setToastNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleClearAllNotifications = () => {
    const dismissedIds = JSON.parse(localStorage.getItem('dismissedNotifications') || '[]');
    const idsToDismiss = notifications.map(n => n.id);
    const updated = Array.from(new Set([...dismissedIds, ...idsToDismiss]));
    localStorage.setItem('dismissedNotifications', JSON.stringify(updated));
    setNotifications([]);
    setToastNotifications([]);
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      // Handle the case where the user cancels the popup or another request is pending
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        console.log('SignIn cancelled or interrupted');
      } else {
        console.error('Login failed:', err);
        showToast('Gagal masuk. Silakan coba lagi.', 'error');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleExportCSV = () => {
    const csvContent = [
      ['ID', 'Nama Sertifikat', 'Pemilik', 'SKP', 'Tanggal Terbit', 'Tanggal Kedaluwarsa', 'Status'],
      ...certificatesData.map(cert => [
        cert.id,
        cert.name,
        cert.owner,
        cert.skp,
        cert.issueDate,
        cert.expiryDate,
        cert.status
      ])
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `data_sertifikat_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRestoreCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split("\n");
      const header = lines[0].split(",");
      const data = lines.slice(1).filter(line => line.trim() !== "").map(line => {
        const values = line.split(",");
        const obj: any = {};
        header.forEach((col, i) => {
          const key = col.toLowerCase().replace(/\s+/g, '');
          // Map CSV keys to internal keys
          if (key === 'id') obj.id = values[i];
          if (key === 'namasertifikat') obj.name = values[i];
          if (key === 'pemilik') obj.owner = values[i];
          if (key === 'skp') obj.skp = parseInt(values[i]);
          if (key === 'tanggalterbit') obj.issueDate = values[i];
          if (key === 'tanggalkedaluwarsa') obj.expiryDate = values[i];
          if (key === 'status') obj.status = values[i];
        });
        return obj;
      });

      if (data.length > 0) {
        const dataWithTimestamps = data.map(item => ({
          ...item,
          updatedAt: Date.now()
        }));
        setCertificatesData(dataWithTimestamps);
        alert(`Berhasil memulihkan ${data.length} data sertifikat.`);
      }
    };
    reader.readAsText(file);
  };

  const sanitizeId = (id: string) => id.replace(/\//g, '-').replace(/\s+/g, '_');

  const handleDeleteCertificate = (id: string | string[]) => {
    const isMultiple = Array.isArray(id);
    setConfirmConfig({
      isOpen: true,
      title: isMultiple ? 'Hapus Sertifikat Terpilih?' : 'Hapus Sertifikat?',
      message: isMultiple 
        ? `Apakah Anda yakin ingin menghapus ${id.length} sertifikat terpilih? Tindakan ini tidak dapat dibatalkan.`
        : 'Apakah Anda yakin ingin menghapus sertifikat ini? Tindakan ini tidak dapat dibatalkan.',
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          if (isMultiple) {
            const promises = id.map(certId => deleteDoc(doc(db, 'certificates', certId)));
            await Promise.all(promises);
            showToast(`${id.length} sertifikat berhasil dihapus.`);
          } else {
            await deleteDoc(doc(db, 'certificates', (id as string)));
            showToast('Sertifikat berhasil dihapus.');
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `certificates/${id}`);
          showToast('Gagal menghapus sertifikat.', 'error');
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  // One-time Cleanup of Dana Data (Requested by user)
  useEffect(() => {
    if (!user || (certificatesData.length === 0 && employeesData.length === 0)) return;

    const performDanaCleanup = async () => {
      const hasCleanedDana = localStorage.getItem('app_dana_data_cleaned');
      if (hasCleanedDana) return;

      try {
        console.log('Performing one-time cleanup of Dana records...');
        // 1. Delete certificates belonging to Dana
        const certToDelete = certificatesData.filter(d => {
          const owner = (d.owner || '').toLowerCase();
          return owner.includes('dana');
        });

        for (const d of certToDelete) {
          await deleteDoc(doc(db, 'certificates', d.id));
        }

        // 2. Delete employee profiles belonging to Dana
        const empToDelete = employeesData.filter(d => {
          const name = (d.name || '').toLowerCase();
          return name.includes('dana');
        });

        for (const d of empToDelete) {
          await deleteDoc(doc(db, 'employees', d.id));
        }

        localStorage.setItem('app_dana_data_cleaned', 'true');
      } catch (e) {
        console.error('Dana cleanup error:', e);
      }
    };

    performDanaCleanup();
  }, [user, certificatesData.length, employeesData.length]);

  // One-time Cleanup of Sample Data (Requested by user)
  useEffect(() => {
    if (!user || certificatesData.length === 0 && employeesData.length === 0) return;

    const performCleanup = async () => {
      const hasCleaned = localStorage.getItem('app_sample_data_cleaned_v2');
      if (hasCleaned) return;

      try {
        console.log('Performing one-time cleanup of non-Dana records...');
        // 1. Delete certificates not belonging to Dana
        const certToDelete = certificatesData.filter(d => {
          const owner = (d.owner || '').toLowerCase();
          return !owner.includes('dana');
        });

        for (const d of certToDelete) {
          await deleteDoc(doc(db, 'certificates', d.id));
        }

        // 2. Delete employee profiles not belonging to Dana
        const empToDelete = employeesData.filter(d => {
          const name = (d.name || '').toLowerCase();
          return !name.includes('dana');
        });

        for (const d of empToDelete) {
          await deleteDoc(doc(db, 'employees', d.id));
        }

        localStorage.setItem('app_sample_data_cleaned_v2', 'true');
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    };

    performCleanup();
  }, [user, certificatesData.length, employeesData.length]);

  const handleEditCertificate = (cert: any) => {
    setEditingCert(cert);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (updatedData: any) => {
    if (!editingCert) return;
    
    try {
      // Explicitly extract serializable fields to prevent non-serializable objects (like File) from reaching Firestore
      const { name, owner, nip, skp, fileUrl, status, fileName } = updatedData;
      
      await updateDoc(doc(db, 'certificates', editingCert.id), {
        name,
        owner,
        nip,
        skp,
        fileUrl,
        status,
        fileName: fileName || '',
        updatedAt: serverTimestamp()
      });

      // Synchronize NIP to employee profile if it's updated in the certificate
      if (updatedData.nip && user) {
        const lowerName = (updatedData.owner || editingCert.owner).trim().toLowerCase();
        const emp = employeesData.find(e => (e.name || '').trim().toLowerCase() === lowerName);
        const empId = emp?.id || sanitizeId(`ID-${(updatedData.owner || editingCert.owner).toUpperCase()}`);
        
        await setDoc(doc(db, 'employees', empId), {
          name: updatedData.owner || editingCert.owner,
          nip: updatedData.nip,
          ownerId: user.uid,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      showToast('Sertifikat berhasil diperbarui!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `certificates/${editingCert.id}`);
      showToast('Gagal memperbarui sertifikat.', 'error');
    }
  };

  const handleEditEmployee = (emp: any) => {
    setEditingEmp(emp);
    setIsEditEmpModalOpen(true);
  };

  const handleSaveEditEmployee = async (updatedData: any) => {
    if (!editingEmp) return;
    
    try {
      // If name changed, update all certificates for this employee too
      if (updatedData.name && updatedData.name !== editingEmp.name) {
        const certsToUpdate = certificatesData.filter(c => 
          c.owner.trim().toLowerCase() === editingEmp.name.trim().toLowerCase()
        );
        
        const updatePromises = certsToUpdate.map(c => 
          updateDoc(doc(db, 'certificates', c.id), { 
            owner: updatedData.name,
            updatedAt: serverTimestamp()
          })
        );
        await Promise.all(updatePromises);
      }

      // Use setDoc with merge: true to handle both existing and "inferred" profiles
      await setDoc(doc(db, 'employees', editingEmp.id), {
        ...updatedData,
        ownerId: user?.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      showToast('Profil karyawan berhasil diperbarui!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `employees/${editingEmp.id}`);
      showToast('Gagal memperbarui profil karyawan.', 'error');
    }
  };

  const handleAddCertificate = async () => {
    const name = prompt('Masukkan Nama Sertifikat:');
    if (!name) return;
    const owner = prompt('Masukkan Nama Pemilik:');
    if (!owner) return;
    const nip = prompt('Masukkan NIP / NRPTT (Opsional):') || '';
    const fileUrl = prompt('Jabatan:') || '';
    
    try {
      await addDoc(collection(db, 'certificates'), {
        name,
        owner,
        nip,
        skp: 10,
        issueDate: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
        expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
        status: 'Aktif',
        fileUrl,
        ownerId: user?.uid,
        updatedAt: serverTimestamp()
      });

      // Sync to employee profile
      if (nip && user) {
        const lowerName = owner.trim().toLowerCase();
        
        // Try to find employee by name OR NIP
        const emp = employeesData.find(e => 
          (e.name || '').trim().toLowerCase() === lowerName || 
          (e.nip && e.nip === nip)
        );
        
        // Use NIP as ID if no employee exists yet, or use existing employee ID
        // Sanitize NIP if used as ID
        const empId = emp?.id || sanitizeId(nip) || sanitizeId(`ID-${owner.toUpperCase()}`);
        
        await setDoc(doc(db, 'employees', empId), {
          name: owner,
          nip: nip,
          role: fileUrl || 'Staf (Otomatis)',
          ownerId: user.uid,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      showToast('Sertifikat berhasil ditambahkan!');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'certificates');
      showToast('Gagal menambahkan sertifikat.', 'error');
    }
  };

  const handleDownloadCertificate = (cert: any) => {
    const content = `Detail Sertifikat\nID: ${cert.id}\nNama: ${cert.name}\nPemilik: ${cert.owner}\nSKP: ${cert.skp}\nBerlaku Hingga: ${cert.expiryDate}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${cert.id}_${cert.name.replace(/\s+/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = (cert: any) => {
    // Simulating PDF download - in a real app jspdf would be used
    const content = `[PDF EXPORT]\n\nSERTIFIKAT KOMPETENSI\n\nID: ${cert.id}\nNama Sertifikat: ${cert.name}\nPemilik: ${cert.owner}\nSKP: ${cert.skp}\nTanggal Terbit: ${cert.issueDate}\nMasa Berlaku: ${cert.expiryDate}\nStatus: ${cert.status}\n\nGenerated on: ${new Date().toLocaleString('id-ID')}`;
    const blob = new Blob([content], { type: 'text/plain' }); // Using text/plain but naming it .pdf for simulation
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Sertifikat_${cert.owner}_${cert.id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleQuickAddCertificate = async (data: any) => {
    try {
      const lowerName = (data.owner || '').trim().toLowerCase();

      // 1. Add the certificate
      const certRef = await addDoc(collection(db, 'certificates'), {
        name: data.name,
        owner: data.owner,
        nip: data.nip || '',
        skp: data.skp || 10,
        fileUrl: data.fileUrl || '',
        fileName: data.fileName || '',
        issueDate: new Date().toLocaleDateString('id-ID'),
        expiryDate: '12 Jan 2026', // Fallback or calculated
        status: 'Aktif',
        ownerId: user?.uid,
        updatedAt: serverTimestamp()
      });

      // 2. Automatically sync NIP to employee profile if provided
      if (data.nip && user) {
        // Try to find employee by name OR NIP
        const emp = employeesData.find(e => 
          (e.name || '').trim().toLowerCase() === lowerName || 
          (e.nip && e.nip === data.nip)
        );
        
        // Use NIP as ID if no employee exists yet, or use existing employee ID
        const empId = emp?.id || sanitizeId(data.nip) || sanitizeId(`ID-${data.owner.toUpperCase()}`);
        
        await setDoc(doc(db, 'employees', empId), {
          name: data.owner,
          nip: data.nip,
          role: data.fileUrl || 'Staf (Otomatis)',
          ownerId: user.uid,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'certificates');
    }
  };

  const handleDeleteEmployeeFull = (emp: any) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Hapus Data Karyawan?',
      message: `Apakah Anda yakin ingin menghapus data ${emp.name} beserta seluruh sertifikatnya? Tindakan ini tidak dapat dibatalkan.`,
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          // 1. Delete certificates.
          const lowerName = (emp.name || '').trim().toLowerCase();
          
          // Fetch certificates - we'll filter by owner name and NIP to be thorough
          const certSnap = await getDocs(collection(db, 'certificates'));
          const certsToDelete = certSnap.docs.filter(d => {
            const data = d.data();
            const owner = (data.owner || '').trim().toLowerCase();
            const nip = data.nip || '';
            return owner === lowerName || (emp.nip && nip === emp.nip);
          });
          
          const deleteCertPromises = certsToDelete.map(d => deleteDoc(d.ref));
          await Promise.all(deleteCertPromises);

          // 2. Delete the employee profile
          if (emp.id) {
            await deleteDoc(doc(db, 'employees', emp.id));
          }
          
          showToast(`Data ${emp.name} dan ${certsToDelete.length} sertifikat berhasil dihapus.`);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'employees/certificates');
          showToast('Gagal menghapus data karyawan.', 'error');
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  const handleClearAll = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Hapus SEMUA Data?',
      message: 'Apakah Anda yakin ingin menghapus SEMUA data sertifikat dan karyawan? Tindakan ini tidak dapat dibatalkan.',
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          const certSnap = await getDocs(collection(db, 'certificates'));
          const certPromises = certSnap.docs.map(d => deleteDoc(d.ref));
          
          const empSnap = await getDocs(collection(db, 'employees'));
          const empPromises = empSnap.docs.map(d => deleteDoc(d.ref));
          
          await Promise.all([...certPromises, ...empPromises]);
          showToast('Semua data berhasil dihapus.');
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'all');
          showToast('Gagal menghapus data. Silakan coba lagi.', 'error');
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  const analyticsStats = useMemo(() => {
    const now = new Date();
    
    // Helper to parse dates like "12 Jan 2024" or "12/01/2024"
    const parseDate = (dateStr: string) => {
      if (!dateStr) return null;
      try {
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        const parts = dateStr.split(' ');
        if (parts.length < 3) return null;
        const day = parseInt(parts[0]);
        const monthMap: Record<string, number> = {
          'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'Mei': 4, 'Jun': 5, 'Jul': 6, 'Agu': 7, 'Sep': 8, 'Okt': 9, 'Nov': 10, 'Des': 11,
          'May': 4, 'Aug': 7, 'Oct': 9, 'Dec': 11
        };
        const month = monthMap[parts[1]] ?? 0;
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
      } catch { return null; }
    };

    const activeCount = certificatesData.filter(c => c.status === 'Aktif').length;
    
    const expiringSoon = certificatesData.filter(c => {
      const d = parseDate(c.expiryDate);
      if (!d) return false;
      const diffTime = d.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 && diffDays <= 30;
    }).length;

    const expiringThisMonth = certificatesData.filter(c => {
      const d = parseDate(c.expiryDate);
      if (!d) return false;
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    const incompleteDocs = employeesData.filter(emp => {
      const empNameLower = emp.name.trim().toLowerCase();
      const empCerts = certificatesData.filter(c => c.owner.trim().toLowerCase() === empNameLower);
      return empCerts.length === 0;
    }).length;

    // To prevent double counting in analytics if employeesData has duplicates
    const uniqueIncompleteOwners = new Set(
      employeesData
        .filter(emp => {
          const empNameLower = emp.name.trim().toLowerCase();
          const hasCerts = certificatesData.some(c => c.owner.trim().toLowerCase() === empNameLower);
          return !hasCerts;
        })
        .map(emp => emp.name.trim().toLowerCase())
    ).size;

    // Bar Chart counts last 6 months
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const barData = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(now.getMonth() - i);
        const name = monthNames[d.getMonth()];
        const count = certificatesData.filter(c => {
            const issueDate = parseDate(c.issueDate);
            return issueDate && issueDate.getMonth() === d.getMonth() && issueDate.getFullYear() === d.getFullYear();
        }).length;
        barData.push({ name, value: count });
    }

    // Pie Chart mapping
    const catMap = {
        'Teknis': { count: 0, color: '#1e3a5f' },
        'Keselamatan': { count: 0, color: '#e67e22' },
        'Soft Skills': { count: 0, color: '#1abc9c' },
        'Kepatuhan': { count: 0, color: '#bdc3c7' }
    };

    certificatesData.forEach(c => {
        const name = (c.name || '').toLowerCase();
        if (name.includes('safety') || name.includes('keselamatan') || name.includes('k3')) catMap['Keselamatan'].count++;
        else if (name.includes('iso') || name.includes('audit') || name.includes('hukum') || name.includes('compliance')) catMap['Kepatuhan'].count++;
        else if (name.includes('manajemen') || name.includes('lead') || name.includes('hr') || name.includes('spesialis')) catMap['Soft Skills'].count++;
        else catMap['Teknis'].count++;
    });

    const pieData = Object.entries(catMap).map(([name, info]) => ({ name, value: info.count, color: info.color }));

    return {
      activeCount,
      expiringThisMonth,
      expiring30Days: expiringSoon,
      incompleteDocs: uniqueIncompleteOwners,
      barData,
      pieData
    };
  }, [certificatesData, employeesData]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="relative">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 bg-blue-500 rounded-full blur-2xl"
          />
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="relative w-16 h-16 border-b-2 border-r-2 border-blue-500 rounded-full"
          />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingView onLogin={handleLogin} isLoading={isLoggingIn} />;
  }

  return (
    <>
      <div className="flex min-h-screen bg-[#f0f4f8] font-sans antialiased text-slate-900 no-print">
        {/* Global Loading Overlay */}
        <AnimatePresence>
          {isDeleting && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] bg-slate-900/40 backdrop-blur-[2px] flex flex-col items-center justify-center"
            >
              <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
                />
                <div className="text-center">
                  <h3 className="font-bold text-slate-800">Menghapus Data...</h3>
                  <p className="text-xs text-slate-500">Mohon tunggu sebentar</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generic App Toast */}
        <AnimatePresence>
          {appToast && (
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className={cn(
                "fixed bottom-10 left-1/2 -translate-x-1/2 z-[1000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border",
                appToast.type === 'success' ? "bg-emerald-600 text-white border-emerald-500" : "bg-rose-600 text-white border-rose-500"
              )}
            >
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                {appToast.type === 'success' ? <BadgeCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <span className="font-bold text-sm">{appToast.message}</span>
              <button onClick={() => setAppToast(null)} className="ml-4 p-1 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <ConfirmModal 
          isOpen={confirmConfig.isOpen}
          onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmConfig.onConfirm}
          title={confirmConfig.title}
          message={confirmConfig.message}
        />

        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} themeColor={themeColor} bgImage={sidebarBgImage} onLogout={handleLogout} user={user} />
        
        <main className="ml-64 flex-1 p-10 max-w-[1600px]">
        <Header 
          title={
            activeTab === 'dashboard' ? "Dashboard Input Data" : 
            activeTab === 'analitik' ? "Analitik Masa Berlaku Sertifikat" : 
            activeTab === 'sertifikat' ? "Daftar Sertifikat Pegawai" :
            activeTab === 'pengaturan' ? "Pengaturan Sistem" :
            "Data & Sertifikat Karyawan"
          } 
          onPrintClick={() => setIsModalOpen(true)}
          onExportClick={handleExportCSV}
          showExport={['sertifikat', 'analitik', 'pengaturan'].includes(activeTab)}
          notifications={notifications}
          onMarkAsRead={handleDismissNotification}
          onClearAllNotifications={handleClearAllNotifications}
        />

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <DashboardView 
                themeColor={themeColor} 
                onAddCertificate={handleQuickAddCertificate} 
                onDeleteCertificate={handleDeleteCertificate}
                onEditCertificate={handleEditCertificate}
                recentCertificates={[...certificatesData].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))}
              />
            </motion.div>
          )}

          {activeTab === 'sertifikat' && (
            <motion.div
              key="sertifikat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <SertifikatView 
                themeColor={themeColor} 
                data={certificatesData} 
                employees={employeesData}
                onDelete={handleDeleteCertificate}
                onEdit={handleEditCertificate}
                onAdd={handleAddCertificate}
                onDeleteEmployee={handleDeleteEmployeeFull}
                onDownload={handleDownloadCertificate}
                onDownloadPDF={handleDownloadPDF}
              />
            </motion.div>
          )}

          {activeTab === 'analitik' && (
            <motion.div
              key="analitik"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatsCard 
                  icon={FileText}
                  label="Total Sertifikat Aktif"
                  value={analyticsStats.activeCount.toLocaleString()}
                  unit="Sertifikat"
                  iconBgColor="bg-blue-100"
                  iconColor="text-blue-600"
                />
                <StatsCard 
                  icon={Calendar}
                  label="Kedaluwarsa Bulan Ini"
                  value={analyticsStats.expiringThisMonth.toString()}
                  unit="Sertifikat"
                  iconBgColor="bg-orange-100"
                  iconColor="text-orange-600"
                />
                <StatsCard 
                  icon={Clock}
                  label="Akan Kedaluwarsa (30 Hari)"
                  value={analyticsStats.expiring30Days.toString()}
                  unit="Sertifikat"
                  iconBgColor="bg-amber-100"
                  iconColor="text-amber-600"
                />
                <StatsCard 
                  icon={AlertTriangle}
                  label="Dokumen Belum Lengkap"
                  value={analyticsStats.incompleteDocs.toString()}
                  unit="Karyawan"
                  iconBgColor="bg-red-100"
                  iconColor="text-red-600"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
                <ActivityBarChart data={analyticsStats.barData} />
                <DistributionPieChart data={analyticsStats.pieData} />
              </div>
            </motion.div>
          )}

          {activeTab === 'karyawan' && (
            <motion.div
              key="karyawan"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <KaryawanView 
                data={employeesData} 
                setData={setEmployeesData} 
                onEdit={handleEditEmployee}
                onDelete={handleDeleteEmployeeFull}
                certificatesData={certificatesData}
                onDownload={handleDownloadCertificate}
                onDownloadPDF={handleDownloadPDF}
              />
            </motion.div>
          )}

          {activeTab === 'pengaturan' && (
            <motion.div
              key="pengaturan"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <SettingsView 
                themeColor={themeColor} 
                onThemeChange={setThemeColor} 
                onExport={handleExportCSV}
                onRestore={handleRestoreCSV}
                onBgImageChange={setSidebarBgImage}
                currentBgImage={sidebarBgImage}
                onClearAll={handleClearAll}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <NotificationToast 
        notifications={toastNotifications} 
        onClose={handleDismissNotification} 
      />

      <PrintModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
      <EditCertModal 
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        cert={editingCert}
        onSave={handleSaveEdit}
        themeColor={themeColor}
      />
      <EditEmployeeModal 
        isOpen={isEditEmpModalOpen}
        onClose={() => setIsEditEmpModalOpen(false)}
        employee={editingEmp}
        onSave={handleSaveEditEmployee}
        themeColor={themeColor}
      />
    </div>
    <PrintReport certificates={certificatesData} />
  </>
);
}

