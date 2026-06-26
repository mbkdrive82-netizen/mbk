'use client';

import { useEffect, useState } from 'react';
import api from '@/services/api';
import CTAButton from '@/components/common/CTAButton';
import notify from '@/lib/toast';
import getErrorMessage from '@/lib/getErrorMessage';
import styles from './AdminDashboard.module.css';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('trainers');
  const [trainers, setTrainers] = useState([]);
  const [errorLogs, setErrorLogs] = useState([]);
  const [errorStats, setErrorStats] = useState(null);
  const [selectedTrainer, setSelectedTrainer] = useState(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [page, setPage] = useState(1);

  // Colleges (real, selectable) — admin can create many and assign one per trainer.
  const [colleges, setColleges] = useState([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState('');
  const [newCollegeName, setNewCollegeName] = useState('');
  const [isCreatingCollege, setIsCreatingCollege] = useState(false);

  // Load trainers + colleges
  useEffect(() => {
    if (activeTab === 'trainers') {
      loadTrainers();
      loadColleges();
    }
  }, [activeTab, page]);

  const loadColleges = async () => {
    try {
      const response = await api.get('/api/trainer-management/colleges');
      setColleges(response.data || []);
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  };

  const handleCreateCollege = async () => {
    const name = newCollegeName.trim();
    if (!name) {
      notify.error('Please enter a college name');
      return;
    }
    setIsCreatingCollege(true);
    try {
      const response = await api.post('/api/trainer-management/colleges', { name });
      notify.success(response?.duplicate ? 'College already exists' : 'College created');
      setNewCollegeName('');
      await loadColleges();
      if (response?.data?._id) {
        setSelectedCollegeId(response.data._id);
      }
    } catch (error) {
      notify.error(getErrorMessage(error));
    } finally {
      setIsCreatingCollege(false);
    }
  };

  // Load error logs
  useEffect(() => {
    if (activeTab === 'errors') {
      loadErrorLogs();
      loadErrorStats();
    }
  }, [activeTab]);

  const loadTrainers = async () => {
    try {
      const response = await api.get('/api/trainer-management/trainers', {
        params: { page, limit: 20 },
      });
      setTrainers(response.data || []);
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  };

  const loadErrorLogs = async () => {
    try {
      const response = await api.get('/api/trainer-management/errors', {
        params: { page, limit: 20, resolved: 'false' },
      });
      setErrorLogs(response.data || []);
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  };

  const loadErrorStats = async () => {
    try {
      const response = await api.get('/api/trainer-management/errors/stats/overview');
      setErrorStats(response.data || null);
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  };

  const handleApproveTrainer = async (trainerId) => {
    try {
      await api.patch(`/api/trainer-management/trainers/${trainerId}/approve`);
      notify.success('Trainer approved successfully!');
      loadTrainers();
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  };

  const handleAssignCollege = async () => {
    if (!selectedTrainer || !selectedCollegeId) {
      notify.error('Please select a trainer and a college');
      return;
    }

    const college = colleges.find((item) => item._id === selectedCollegeId);
    if (!college) {
      notify.error('Selected college not found. Please refresh.');
      return;
    }

    setIsAssigning(true);
    try {
      await api.post('/api/trainer-management/trainers/assign-college', {
        trainerId: selectedTrainer._id,
        collegeId: college._id,
        collegeName: college.name,
      });
      notify.success(`"${college.name}" assigned successfully!`);
      setSelectedTrainer(null);
      setSelectedCollegeId('');
      loadTrainers();
    } catch (error) {
      notify.error(getErrorMessage(error));
    } finally {
      setIsAssigning(false);
    }
  };

  const handleResolveError = async (errorId, resolution) => {
    try {
      await api.patch(`/api/trainer-management/errors/${errorId}/resolve`, {
        resolution,
      });
      notify.success('Error marked as resolved!');
      loadErrorLogs();
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  };

  return (
    <main className={styles.container}>
      <div className={styles.header}>
        <h1>Admin Dashboard</h1>
        <p>Trainer Management & System Monitoring</p>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'trainers' ? styles.active : ''}`}
          onClick={() => setActiveTab('trainers')}
        >
          👥 Trainers
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'errors' ? styles.active : ''}`}
          onClick={() => setActiveTab('errors')}
        >
          ⚠️ Error Logs
        </button>
      </div>

      {/* Trainers Tab */}
      {activeTab === 'trainers' && (
        <section className={styles.section}>
          <h2>Trainer Management</h2>

          {selectedTrainer ? (
            <div className={styles.assignPanel}>
              <h3>Assign College to {selectedTrainer.firstName} {selectedTrainer.lastName}</h3>

              <select
                value={selectedCollegeId}
                onChange={(e) => setSelectedCollegeId(e.target.value)}
                className={styles.input}
              >
                <option value="">Select a college…</option>
                {colleges.map((college) => (
                  <option key={college._id} value={college._id}>
                    {college.name}
                  </option>
                ))}
              </select>

              <div className={styles.buttonGroup}>
                <CTAButton
                  onClick={handleAssignCollege}
                  variant="brand"
                  loading={isAssigning}
                  loadingText="Assigning..."
                  disabled={!selectedCollegeId}
                >
                  Assign College
                </CTAButton>
                <CTAButton
                  onClick={() => {
                    setSelectedTrainer(null);
                    setSelectedCollegeId('');
                  }}
                  variant="outline"
                >
                  Cancel
                </CTAButton>
              </div>
            </div>
          ) : null}

          {/* College management: create many colleges, assign any one to a trainer */}
          <div className={styles.assignPanel}>
            <h3>Colleges ({colleges.length})</h3>
            <div className={styles.buttonGroup}>
              <input
                type="text"
                value={newCollegeName}
                onChange={(e) => setNewCollegeName(e.target.value)}
                placeholder="New college name (e.g. Government Arts College Chennai)"
                className={styles.input}
              />
              <CTAButton
                onClick={handleCreateCollege}
                variant="secondary"
                loading={isCreatingCollege}
                loadingText="Creating..."
              >
                Create College
              </CTAButton>
            </div>
            {colleges.length > 0 ? (
              <ul style={{ marginTop: '0.75rem', listStyle: 'disc', paddingLeft: '1.25rem' }}>
                {colleges.slice(0, 10).map((college) => (
                  <li key={college._id}>{college.name}{college.code ? ` (${college.code})` : ''}</li>
                ))}
              </ul>
            ) : (
              <p style={{ marginTop: '0.5rem', color: '#64748b' }}>No colleges yet. Create one above.</p>
            )}
          </div>

          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr className={styles.tr}>
                  <th className={styles.th}>Name</th>
                  <th className={styles.th}>Email</th>
                  <th className={styles.th}>Phone</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Colleges</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody className={styles.tbody}>
                {trainers.map(trainer => (
                  <tr key={trainer._id} className={styles.tr}>
                    <td className={styles.td}>
                      <strong>{trainer.firstName} {trainer.lastName}</strong>
                    </td>
                    <td className={styles.td}>{trainer.email}</td>
                    <td className={styles.td}>{trainer.phone}</td>
                    <td className={styles.td}>
                      <span className={`${styles.badge} ${styles[trainer.registrationStatus]}`}>
                        {trainer.registrationStatus}
                      </span>
                    </td>
                    <td className={styles.td}>{trainer.colleges?.length || 0}</td>
                    <td className={styles.td}>
                      <div className={styles.actions}>
                        {trainer.registrationStatus === 'pending' && (
                          <CTAButton
                            size="sm"
                            variant="brand"
                            onClick={() => handleApproveTrainer(trainer._id)}
                          >
                            Approve
                          </CTAButton>
                        )}
                        <CTAButton
                          size="sm"
                          variant="secondary"
                          onClick={() => setSelectedTrainer(trainer)}
                        >
                          Assign
                        </CTAButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Error Logs Tab */}
      {activeTab === 'errors' && (
        <section className={styles.section}>
          <h2>System Error Logs</h2>

          {errorStats && (
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statValue}>{errorStats.total}</div>
                <div className={styles.statLabel}>Total Errors</div>
              </div>
              <div className={styles.stat} style={{ borderColor: '#ef4444' }}>
                <div className={styles.statValue} style={{ color: '#ef4444' }}>
                  {errorStats.bySeverity?.critical || 0}
                </div>
                <div className={styles.statLabel}>Critical</div>
              </div>
              <div className={styles.stat} style={{ borderColor: '#f59e0b' }}>
                <div className={styles.statValue} style={{ color: '#f59e0b' }}>
                  {errorStats.bySeverity?.high || 0}
                </div>
                <div className={styles.statLabel}>High</div>
              </div>
              <div className={styles.stat} style={{ borderColor: '#10b981' }}>
                <div className={styles.statValue} style={{ color: '#10b981' }}>
                  {errorStats.unresolved || 0}
                </div>
                <div className={styles.statLabel}>Unresolved</div>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr className={styles.tr}>
                  <th className={styles.th}>Error Type</th>
                  <th className={styles.th}>Severity</th>
                  <th className={styles.th}>Message</th>
                  <th className={styles.th}>Trainer</th>
                  <th className={styles.th}>Date</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody className={styles.tbody}>
                {errorLogs.map(error => (
                  <tr key={error._id} className={`${styles.tr} ${styles.errorRow} ${styles[error.severity]}`}>
                    <td className={styles.td}><strong>{error.errorType}</strong></td>
                    <td className={styles.td}>
                      <span className={`${styles.severityBadge} ${styles[error.severity]}`}>
                        {error.severity}
                      </span>
                    </td>
                    <td className={`${styles.td} ${styles.message}`}>{error.message}</td>
                    <td className={styles.td}>
                      {error.trainerId?.firstName} {error.trainerId?.lastName}
                    </td>
                    <td className={styles.td}>{new Date(error.createdAt).toLocaleDateString()}</td>
                    <td className={styles.td}>
                      <CTAButton
                        size="sm"
                        variant="outline"
                        onClick={() => handleResolveError(error._id, 'Resolved by admin')}
                      >
                        Resolve
                      </CTAButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
