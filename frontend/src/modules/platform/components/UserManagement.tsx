import React, { useState, useEffect } from 'react';
import { apiClient } from '../../../api/client';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';

export const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // User Form State
    const [selectedCompanyId, setSelectedCompanyId] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [accessMode, setAccessMode] = useState<'FULL_COMPANY' | 'CUSTOM'>('FULL_COMPANY');
    const [companyModules, setCompanyModules] = useState<string[]>([]);
    const [capabilities, setCapabilities] = useState<any[]>([]);
    const [customModules, setCustomModules] = useState<string[]>([]);
    
    const fetchUsers = async () => {
        try {
            const res = await apiClient.get('/api/accounts/users/');
            setUsers(res.data.results || (Array.isArray(res.data) ? res.data : []));
        } catch (e) {
            console.error("Failed to fetch users", e);
        }
    };
    
    const fetchCompanies = async () => {
        try {
            const res = await apiClient.get('/api/companies/companies/');
            setCompanies(res.data.results || (Array.isArray(res.data) ? res.data : []));
        } catch (e) {
            console.error("Failed to fetch companies", e);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchCompanies();
    }, []);

    const handleCompanyChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const compId = e.target.value;
        setSelectedCompanyId(compId);
        setCompanyModules([]);
        setCapabilities([]);
        setCustomModules([]);
        
        if (compId) {
            try {
                const res = await apiClient.get(`/api/platform/runtime-config/?company_id=${compId}`);
                setCompanyModules(res.data.company_modules || []);
                setCapabilities(res.data.capabilities || []);
            } catch (e) {
                console.error("Failed to fetch company runtime config", e);
            }
        }
    };

    const handleModuleToggle = (moduleCode: string) => {
        if (customModules.includes(moduleCode)) {
            setCustomModules(customModules.filter(m => m !== moduleCode));
        } else {
            setCustomModules([...customModules, moduleCode]);
        }
    };

    const handleSaveUser = async () => {
        if (!username || !password || !selectedCompanyId) {
            alert('Username, password and company are required');
            return;
        }

        try {
            const payload = {
                username,
                email,
                password,
                company: selectedCompanyId,
                access_mode: accessMode,
                custom_modules: accessMode === 'CUSTOM' ? customModules : [],
                role: 'admin' // Generic safe role for admin assignment
            };
            await apiClient.post('/api/accounts/users/', payload);
            setIsModalOpen(false);
            fetchUsers();
            
            // Reset
            setUsername('');
            setEmail('');
            setPassword('');
            setSelectedCompanyId('');
            setAccessMode('FULL_COMPANY');
            setCustomModules([]);
        } catch (e) {
            console.error(e);
            alert('Error creating user');
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3>Users</h3>
                <Button variant="primary" onClick={() => setIsModalOpen(true)}>Create User</Button>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
                <thead>
                    <tr style={{ background: 'var(--color-surface-secondary)', textAlign: 'left' }}>
                        <th style={{ padding: '12px' }}>Username</th>
                        <th style={{ padding: '12px' }}>Email</th>
                        <th style={{ padding: '12px' }}>Company</th>
                        <th style={{ padding: '12px' }}>Access Mode</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(u => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '12px' }}>{u.username}</td>
                            <td style={{ padding: '12px' }}>{u.email}</td>
                            <td style={{ padding: '12px' }}>{companies.find(c => c.id === u.company)?.name || u.company}</td>
                            <td style={{ padding: '12px' }}>{u.access_mode}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create User" size="large">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <Input label="Username" value={username} onChange={e => setUsername(e.target.value)} required />
                    <Input label="Email" value={email} onChange={e => setEmail(e.target.value)} />
                    <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                    
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>Company</label>
                        <select 
                            value={selectedCompanyId} 
                            onChange={handleCompanyChange}
                            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                        >
                            <option value="">Select Company...</option>
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {selectedCompanyId && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>Access Mode</label>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input 
                                        type="radio" 
                                        name="accessMode" 
                                        value="FULL_COMPANY" 
                                        checked={accessMode === 'FULL_COMPANY'} 
                                        onChange={() => setAccessMode('FULL_COMPANY')} 
                                    />
                                    Full Company Access
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input 
                                        type="radio" 
                                        name="accessMode" 
                                        value="CUSTOM" 
                                        checked={accessMode === 'CUSTOM'} 
                                        onChange={() => setAccessMode('CUSTOM')} 
                                    />
                                    Custom Access
                                </label>
                            </div>
                        </div>
                    )}

                    {accessMode === 'CUSTOM' && selectedCompanyId && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>Module Access</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--color-surface-secondary)', padding: '16px', borderRadius: '4px' }}>
                                {capabilities.length > 0 ? capabilities.map(cap => (
                                    <label key={cap.code} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={customModules.includes(cap.engine)}
                                            onChange={() => handleModuleToggle(cap.engine)}
                                        />
                                        {cap.label}
                                    </label>
                                )) : companyModules.map(modCode => (
                                    <label key={modCode} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={customModules.includes(modCode)}
                                            onChange={() => handleModuleToggle(modCode)}
                                        />
                                        {modCode}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button variant="primary" onClick={handleSaveUser}>Save</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
